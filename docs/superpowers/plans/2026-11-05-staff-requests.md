# Nhân viên tạo và huỷ yêu cầu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phần BE cho luồng nhân viên tạo 6 loại đơn và huỷ đơn đang chờ, Admin nhắc giải trình, nhân viên thấy lời nhắc và gửi giải trình. Sau đó nối FE (do phiên khác làm trên dữ liệu giả) với BE.

**Phân việc (05/11/2026):**
- FE trên dữ liệu giả (spec mục 4) do phiên khác làm, ở nhánh `claude/staff-requests-fe-mock`, plan `docs/superpowers/plans/2026-11-05-staff-requests-fe-mock.md`.
- Người dùng nói ở phiên đó: "làm phần mock trước, nối API thì để BE".
- Vì vậy plan này làm BE (Task 0–10) và nối API (Task 11). Không dựng lại giao diện.

**Architecture:**
- **BE:**
  - Luật thuần mới đặt ở `src/modules/requests/domain/`: `filing-rules.ts`, `explanation-detect.ts`.
  - Mỗi hàm `create*` của `RequestsService` tách thành hai bước, lập đơn và lưu, để có `previewRequest`.
  - Dịch vụ mới `ExplanationsService` lo ngày cần giải trình và lời nhắc, lưu vào bảng `explanation_reminders`.
  - `MeController` thêm route `request-context` và `preview`, và thêm trường cho `today`, `attendance/:date`, `profile`.
- **FE (Task 11):** thay các nhánh `notConnected()` trong `web/src/services/staff-requests.ts` và trong chuông Admin bằng lời gọi route thật. Giao diện và dữ liệu giả giữ nguyên như phiên kia làm.

**Tech Stack:** NestJS 10, Kysely, PostgreSQL 16, `node:test` + tsx; Vue 3, Pinia, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-staff-requests-design.md`, kèm yêu cầu cho thiết kế `docs/superpowers/specs/2026-11-05-staff-requests-fe-brief.md`.

## Global Constraints

**Luật và phạm vi**
- Luật chỉ lấy từ spec mục 0.
- Câu hỏi Q1 (`advance_on`) chưa có câu trả lời, nên không làm.
- Không đọc `spec/` (v1).

**Xác minh**
- Không chạy `npm run typecheck` hay `npm run format:check`.
- Chạy một file test BE: `node --import tsx --test test/v2/<file>.test.ts`.
- Chạy toàn bộ BE: `PG_TEST_URL=postgres://postgres@127.0.0.1:55465/postgres npm test`, trên container `luong-test-pg-staff-requests` (Task 0).
- Chạy test FE: `PW_PORT=4255 npm --prefix web run test:ui` (thêm tên file spec để chạy một file).

**Lược đồ DB:** sửa thẳng `migrations/postgres/schema.sql`, không tạo file đánh số. DB dev được ghi đè.

**Giới hạn thao tác**
- Không merge vào `main`, không push.
- Không đụng các nhánh FE `claude/admin-ui-concept-6445c9`, `claude/vigilant-feynman-dbb291`, `claude/musing-brahmagupta-cbd29d`.
- Không xoá container của phiên khác.
- Không in hay commit giá trị bí mật; không dùng mật khẩu admin trong `deploy/secrets/luong.env`.

**Quy ước code**
- "Hôm nay" luôn tính theo giờ Việt Nam (`vietnamToday(this.now())`). Thời điểm lưu DB là ISO UTC.
- Route Admin mới:
  - có `@RequireCap('requests.review')`;
  - khai báo trước `@Get(':id')`;
  - có dòng trong bảng `test/v2/auth-access.test.ts`.
- Route `/me` mới: có `@Authenticated()` và có dòng trong cùng bảng đó.

**BE vẫn kiểm mọi luật** dù UI chỉ đưa ra lựa chọn hợp lệ. Câu báo lỗi của BE là tiếng Việt, đúng như các bảng trong từng task.

**Task 11 không sửa giao diện hay dữ liệu giả** của phiên FE; chỉ sửa nhánh máy chủ thật và builder đọc phản hồi.

**Commit:** cuối mỗi task, message tiếng Anh dạng `feat(requests): …`, dòng cuối `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Giờ Việt Nam lúc nộp tạm ứng.** Nộp lúc 00:30 ngày 16 (giờ UTC vẫn là ngày 15) thì mở; 23:30 ngày 17 vẫn mở; 00:30 ngày 18 thì khoá. Test: Task 5, `advance window follows VN date`.
2. **Ca đêm 22–07.** Giờ OT gợi ý phải tránh cả ca đêm hôm trước lẫn ca tối nay. Giải trình phải đọc được giờ ra sáng hôm sau cho đúng ngày công. Test: Task 1 `night shift hours`, Task 2 `night shift out next morning`.
3. **Xem trước đã cũ.** Xem trước báo hợp lệ, rồi một thiết bị khác giữ mất ngày trước khi bấm Gửi. Khi đó create ném `DayConflictError` (route trả 400 `DAY_CONFLICT`), và preview lần sau trả `ok:false, code:'DAY_CONFLICT'`. Test: Task 3, `stale preview then conflict`.
4. **Huỷ đơn giải trình.** Đơn bị huỷ thì ngày đó lại cần giải trình, và lời nhắc cũ hiện lại. Test: Task 8, `cancelled explanation brings the reminder back`.
5. **Không tính được phiếu lương ngày 16.** `request-context` vẫn trả về; chỉ loại `advance` bị khoá, lý do "Chưa tính được số tiền tạm ứng". Test: Task 9, `advance quote failure only locks advance`.

## Ruling (tự quyết khi lập plan)

- **R-P1.** `days[].shift` không có `type`: `EmployeeDays.shiftOf` không biết loại ca, và form không cần. Spec mục 2.1 đã bỏ `type` khỏi ví dụ. Rủi ro nếu sai: FE muốn hiện loại ca thì phải thêm sau.
- **R-P2.** Khi tính `hasOt` để bỏ trường hợp "Quên check-out", tính cả OT đang chờ duyệt lẫn đã duyệt. Rủi ro nếu sai: OT chờ bị từ chối thì ngày đó không hiện "Quên check-out" cho tới khi nhân viên mở lại form.
- **R-P3.** Tiêu đề OT có giờ lẻ (Admin nộp thay): ghi `HH:MM`, ví dụ "Làm thêm 10/11 18:30–20h". Rủi ro nếu sai: chỉ là cách ghi.
- **R-P4.** Thứ tự kiểm khi xét một ngày giải trình: tương lai → tháng đã chốt → không phải ngày làm (gồm trước ngày vào làm) → đã có đơn → không có trường hợp. Ngày không phải ngày làm báo "Ngày DD/MM không phải ngày làm". Rủi ro nếu sai: chỉ khác câu báo.
- **R-P5.** Ngày có ca đêm thì không kiểm "giờ ra sau giờ vào", vì giờ ra rơi vào sáng hôm sau. Rủi ro nếu sai: khai ngược giờ trên ca đêm lọt qua; Admin vẫn thấy khi duyệt.
- **R-P6.** `GET /requests/explanations-due` xét lần lượt từng nhân viên chưa bị khoá (`locked_at IS NULL`). Rủi ro nếu sai: chậm khi có nhiều người; đổi sang một truy vấn gộp sau nếu cần.
- **R-P7.** `today.reminders` lỗi (ví dụ thiếu cấu hình loại nhân sự) thì trả `[]`, để màn Hôm nay không vỡ. Rủi ro nếu sai: lời nhắc bị ẩn trong lúc thiếu cấu hình.
- **R-P8.** Số trên chuông (máy chủ thật) vẫn chỉ đếm đơn chờ duyệt; việc "Chấm công" chưa cộng vào số. Rủi ro nếu sai: Admin không thấy số tăng khi có ngày thiếu giờ.
- **R-P9.** (Bỏ: dữ liệu giả thuộc phiên FE.)
- **R-P10.** Câu báo khi xếp thiếu giờ bù đổi thành "Còn thiếu N giờ bù", theo spec mục 2.2. Xếp thừa thì giữ câu cũ "Cần đúng … giờ bù, đang xếp … giờ".

---

### Task 0: Chuẩn bị nhánh

**Files:** không sửa file.

- [ ] Kiểm hai phụ thuộc (a) và (b):

```bash
git merge-base --is-ancestor 620e434 main && echo a-ok
for c in 179aeae 2a16f3c 6001bd5; do git merge-base --is-ancestor $c main && echo $c-ok; done
```

  - Expected: in ra `a-ok` và ba dòng `…-ok`.
  - 620e434 là commit merge nhánh staff-app (`claude/wire-staff-app-f5adca`, d64ee73) cùng admin-cleanup.
  - Thiếu `a-ok` thì dừng, báo người dùng, không viết code.
  - Kiểm ngày 05/11: `main` đã có 620e434.
- [ ] `git merge main`. Không đi thẳng được thì tạo merge commit.
  - Dự kiến xung đột ở `me.controller.ts`, `staff-phone.ts` (builder và mock), `DayBody.vue`, `TodayColumn.vue`, `useDesktopDetail.ts`.
  - Có xung đột thì giải, giữ thay đổi của cả hai bên. Nhánh này hiện chỉ có tài liệu nên xung đột, nếu có, chỉ nằm ở `docs/`.
- [ ] Bật container rồi chạy test nền:

```bash
docker run -d --rm --name luong-test-pg-staff-requests -p 127.0.0.1:55465:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
PG_TEST_URL=postgres://postgres@127.0.0.1:55465/postgres npm test
```

  Expected: mọi test pass. Ghi số test làm mốc.

---

### Task 1: Luật nộp đơn thuần

**Files:**
- Create: `src/modules/requests/domain/filing-rules.ts`
- Modify: `src/modules/requests/domain/index.ts` (thêm `export * from './filing-rules'`)
- Test: `test/v2/requests-filing-rules.test.ts`

**Interfaces — Produces:**

```ts
export type FiledBy = 'self' | 'admin';
export function filingWindow(today: string): { from: string; to: string }; // to = ngày cuối tháng sau
export function isWholeHour(time: string): boolean;                       // đúng 'HH:00'
export function advanceDayOpen(today: string): boolean;                   // ngày 16 hoặc 17
export function isClosedPeriod(row: { status: string } | null): boolean;  // có dòng và status !== 'open'
export interface HourOption { start: number; ends: Array<{ end: number; minutes: number }> }
export function dayHourOptions(input: {
  date: string; shifts: readonly ShiftSpan[]; hasShift: boolean; windows: readonly ClockWindow[];
}): HourOption[];
export type TitleInput =
  | { kind: 'leave'; leaveType: LeaveType; startDate: string; endDate: string }
  | { kind: 'leave-with-makeup'; startDate: string; endDate: string }
  | { kind: 'overtime'; date: string; startTime: string; endTime: string }
  | { kind: 'shift-change'; frame: ShiftFrame; startDate: string; endDate: string }
  | { kind: 'explanation'; date: string }
  | { kind: 'advance'; month: string };
export function requestTitle(input: TitleInput): string;
export function annualLeaveLeftOf(
  balance: { leaveBalance: number; leaveBalanceOn: string | null; leaveAccount: boolean },
  active: readonly SystemRequest[]
): number | null;
```

**Cách tính `dayHourOptions`:**
- Duyệt mọi cặp giờ tròn với `start` từ 6 đến 21 và `end` từ `start + 1` đến 22.
- Một cặp được giữ khi qua được cả hai kiểm tra:
  - `windowError({ date, startTime, endTime, kind: 'OT' }, shifts, windows) === null`;
  - `dayCapError(date, hasShift, [...windows, w]) === null`.
- `minutes` lấy bằng `workMinutes`.
- Bỏ các `start` không còn `end` nào.

**Cách tính `annualLeaveLeftOf`:**
- `leaveAccount` là false thì trả `null`.
- Ngược lại, lấy `leaveBalance` trừ tổng `leaveDaysCount` của các đơn thoả cả ba điều kiện:
  - `LEAVE` với `leaveType` là `ANNUAL`;
  - đang PENDING hoặc APPROVED;
  - `leaveStartDate >= leaveBalanceOn` (khi `leaveBalanceOn` là `null` thì tính mọi đơn).

**Các bước:**

- [ ] **Step 1: Viết test.** Hôm nay là 2026-11-04, ngày 1/11 là Chủ nhật. Dùng helper `S(d, a, b) = { startDate: d, startTime: a, endTime: b }`.
  - `filing window`:
    - `filingWindow('2026-11-04')` deepEqual `{ from: '2026-11-04', to: '2026-12-31' }`;
    - `'2026-12-31'` cho `to` = `'2027-01-31'`;
    - `'2027-01-30'` cho `'2027-02-28'`;
    - `'2027-12-05'` cho `'2028-01-31'`.
  - `whole hours`: `'18:00'` → true; `'18:30'` → false; `'6:00'` → false.
  - `advance days`: `'2026-11-15'` → false; `'2026-11-16'` → true; `'2026-11-17'` → true; `'2026-11-18'` → false.
  - `closed period`: `null` → false; `{status:'open'}` → false; `'attendance_locked'` → true; `'LOCKED'` → true; `'paid'` → true.
  - `day shift hours`: date `'2026-11-05'`, shifts là `S('2026-11-04','08:00','17:00')` cùng ngày 05 và 06, `hasShift: true`, `windows: []`. Kết quả deepEqual:

    ```ts
    [{ start: 6, ends: [{ end: 7, minutes: 60 }] },
     { start: 18, ends: [{ end: 19, minutes: 60 }, { end: 20, minutes: 120 }, { end: 21, minutes: 180 }, { end: 22, minutes: 240 }] },
     { start: 19, ends: [{ end: 20, minutes: 60 }, { end: 21, minutes: 120 }, { end: 22, minutes: 180 }] },
     { start: 20, ends: [{ end: 21, minutes: 60 }, { end: 22, minutes: 120 }] },
     { start: 21, ends: [{ end: 22, minutes: 60 }] }]
    ```

  - `sunday hours`: date `'2026-11-08'`, shifts là ngày 07 và 09 (08–17), `hasShift: false`.
    - Các `start` là 6..21.
    - Phần tử cuối của `ends` khi start 6 là `{ end: 21, minutes: 720 }`.
    - Không có `end: 22` khi start 6.
  - `existing OT`: ca 08–17, `windows: [{ date: '2026-11-12', startTime: '18:00', endTime: '20:00', kind: 'OT' }]`.
    - Các `start` là `[6, 20, 21]`.
    - `ends` của 20 là `[{ end: 21, minutes: 60 }, { end: 22, minutes: 120 }]`.
  - `night shift hours` (Review Focus 2): date `'2026-11-05'`, shifts là `S('2026-11-04','22:00','07:00')` và `S('2026-11-05','22:00','07:00')`, `hasShift: true`.
    - Các `start` là 8..20.
    - Phần tử đầu là `{ start: 8, ends: [9,10,11,12] }`, với minutes 60, 120, 180, 240.
    - Phần tử cuối là `{ start: 20, ends: [{ end: 21, minutes: 60 }] }`.
  - `titles`:
    - leave ANNUAL 13–16/11 → `'Phép năm 13–16/11'`;
    - leave PERSONAL_PAID 13–13/11 → `'Việc riêng có lương 13/11'`;
    - leave ANNUAL 30/11–02/12 → `'Phép năm 30/11–02/12'`;
    - makeup 13–14/11 → `'Nghỉ có làm bù 13–14/11'`;
    - overtime 10/11 18:00–20:00 → `'Làm thêm 10/11 18–20h'`;
    - overtime 18:30–20:00 → `'Làm thêm 10/11 18:30–20h'`;
    - shift-change FLEX 06:00–15:00, 10–12/11 → `'Đổi ca Flex 06–15, 10–12/11'`;
    - shift-change NIGHT 22:00–07:00, 10–10/11 → `'Đổi ca Night 22–07, 10/11'`;
    - explanation 2026-10-27 → `'Giải trình 27/10'`;
    - advance 2026-11 → `'Tạm ứng lương tháng 11'`.
  - `annual leave left`:
    - `{ leaveBalance: 12, leaveBalanceOn: null, leaveAccount: true }` với `leaveRequest('2026-11-13','2026-11-16','PENDING',{ leaveDaysCount: 3 })`, cộng một đơn ANNUAL REJECTED 2 ngày, cộng một đơn PERSONAL_PAID → `9`;
    - `leaveBalanceOn: '2026-11-01'` với một đơn APPROVED từ `'2026-10-20'`, 2 ngày → `12`;
    - `leaveAccount: false` → `null`.
- [ ] **Step 2:** `node --import tsx --test test/v2/requests-filing-rules.test.ts`. Expected: FAIL (không tìm thấy module).
- [ ] **Step 3:** Viết `filing-rules.ts` theo phần Interfaces.
  - Nhãn hình thức nghỉ lấy từ `LEAVE_TYPES`.
  - Nhãn khung ca: NORMAL → `Normal`, FLEX → `Flex`, NIGHT → `Night`.
  - Khoảng ngày cùng tháng ghi `DD–DD/MM`; một ngày ghi `DD/MM`; khác tháng ghi `DD/MM–DD/MM`.
- [ ] **Step 4:** Chạy lại lệnh ở Step 2. Expected: PASS.
- [ ] **Step 5:** Commit `feat(requests): filing rules, hour options and server titles`.

---

### Task 2: Phát hiện trường hợp giải trình

**Files:**
- Create: `src/modules/requests/domain/explanation-detect.ts`
- Modify: `src/modules/requests/domain/index.ts`
- Test: `test/v2/requests-explanation-detect.test.ts`

**Interfaces — Produces:**

```ts
export interface ExplanationNeeds { checkIn: boolean; checkOut: boolean }
export interface DetectInput {
  date: string; today: string; shiftStart: string; shiftEnd: string;
  checkIn: Date | null; checkOut: Date | null; hasOt: boolean;
}
export function explanationCasesOf(input: DetectInput): { cases: ExplanationCase[]; needs: ExplanationNeeds };
```

**Mốc giờ:**
- `start` = `${date}T${shiftStart}:00+07:00`.
- `end` = `${date}T${shiftEnd}:00+07:00`. Khi `shiftEnd <= shiftStart` thì cộng thêm một ngày.
- `past` nghĩa là `date < today`.

**Trường hợp về giờ vào** (xét trước, tối đa một trường hợp):
- Có giờ vào, sớm hơn `start` quá 15 phút (lệch < −15) → `EARLY_CHECK_IN`.
- Có giờ vào, muộn hơn `start` quá 15 phút (lệch > 15) → `LATE_CHECK_IN`.
- Không có giờ vào, và (có giờ ra hoặc `past`) → `MISSING_CHECK_IN`.

**Trường hợp về giờ ra** (xét sau, tối đa một trường hợp):
- Có giờ ra, trước `end` (lệch < 0) → `EARLY_CHECK_OUT`.
- Có giờ ra, sau `end` quá 30 phút (lệch > 30) và `!hasOt` → `FORGOT_CHECK_OUT`.
- Không có giờ ra và `past` → `MISSING_CHECK_OUT`.

**`needs`** đánh dấu những trường hợp thiếu giờ:
- `needs.checkIn` là true khi có `MISSING_CHECK_IN`;
- `needs.checkOut` là true khi có `MISSING_CHECK_OUT`.

**Các bước:**

- [ ] **Step 1: Viết test.** Dùng `vn(d, t) = new Date(`${d}T${t}:00+07:00`)`, ca 08:00–17:00, date `'2026-10-27'`, today `'2026-10-28'`, `hasOt: false`. Mỗi dòng là một `it`:
  - `late in`: 08:40 / 17:05 → `['LATE_CHECK_IN']`, needs `{false,false}`.
  - `early in`: 07:30 / 17:00 → `['EARLY_CHECK_IN']`.
  - `edges are valid`: 08:15 / 17:30 → `[]`; 07:45 / 17:00 → `[]`.
  - `early out`: 08:00 / 16:30 → `['EARLY_CHECK_OUT']`.
  - `late out without OT`: 08:00 / 17:45 → `['FORGOT_CHECK_OUT']`; cùng giờ đó với `hasOt: true` → `[]`.
  - `missing in`: null / 17:00 → `['MISSING_CHECK_IN']`, needs `{checkIn:true, checkOut:false}`.
  - `missing out on a past day`: 08:00 / null → `['MISSING_CHECK_OUT']`, needs `{checkIn:false, checkOut:true}`.
  - `no punches on a past day`: null / null → `['MISSING_CHECK_IN','MISSING_CHECK_OUT']`, needs cả hai true.
  - `two cases on one day`: 08:40 / null → `['LATE_CHECK_IN','MISSING_CHECK_OUT']`.
  - `today only counts certain cases` (date = today = `'2026-10-28'`):
    - 08:00 / null → `[]`;
    - null / null → `[]`;
    - null / 12:00 → `['MISSING_CHECK_IN','EARLY_CHECK_OUT']`.
  - `night shift out next morning` (Review Focus 2): ca 22:00–07:00, vào `vn('2026-10-27','22:30')`, ra `vn('2026-10-28','07:00')` → `['LATE_CHECK_IN']`.
- [ ] **Step 2:** Chạy file test. Expected: FAIL.
- [ ] **Step 3:** Viết `explanationCasesOf`.
- [ ] **Step 4:** Chạy file test. Expected: PASS.
- [ ] **Step 5:** Commit `feat(requests): detect explanation cases from punches`.

---

### Task 3: Tách create thành lập đơn và lưu; tiêu đề server; xem trước

**Files:**
- Modify: `src/modules/requests/requests.service.ts`
- Modify: các test `test/v2/requests-*.test.ts` đang so `title` hoặc câu "Cần đúng … giờ bù" với giá trị client gửi.
- Test: `test/v2/requests-preview.test.ts`

**Interfaces — Consumes:** `requestTitle`, `annualLeaveLeftOf`, `FiledBy` (Task 1).

**Interfaces — Produces:**

```ts
export type FilingKind = 'leave' | 'leave-with-makeup' | 'overtime' | 'shift-change' | 'explanation' | 'advance';
export interface FilingOptions { filedBy?: FiledBy }   // mặc định 'admin'
export type PreviewResult =
  | { ok: true; title: string; summary: Record<string, unknown>; warnings: string[] }
  | { ok: false; message: string; code?: 'DAY_CONFLICT' };
// RequestsService
previewRequest(kind: FilingKind, input: any, opts?: FilingOptions): Promise<PreviewResult>;
createLeaveRequest(input, opts?: FilingOptions): Promise<CreatedRequestDTO>;  // 6 hàm create* (trừ iSAT) đều thêm opts
```

**Cấu trúc bên trong:**
- Thêm `interface PlannedRequest { request: SystemRequest; claims: { plan: ClaimPlan; status: ClaimStatus } | null; summary: Record<string, unknown>; warnings: string[] }`.
- Thêm hàm `private fileRequest(kind, input, opts, save: boolean): Promise<PlannedRequest>`:
  - kiểm dữ liệu vào và tìm nhân viên như hiện tại;
  - chạy planner của loại đơn trong `underEmployeeLock`;
  - khi `save` là true thì `requests.save` rồi `claimDays` trong cùng khoá.
- Mỗi planner (`planLeave`, `planMakeup`, `planOvertime`, `planShiftChange`, `planExplanation`, `planAdvance`) giữ nguyên mọi kiểm tra hiện có.
- `title` luôn lấy từ `requestTitle`; `input.title` bị bỏ qua.
- Đơn nghỉ dùng `annualLeaveLeftOf` cho bước kiểm số dư.

**`summary` theo loại** (spec mục 2.2):

| Loại | `summary` |
|---|---|
| leave | `{ dates, daysCount, annualLeaveLeftAfter }` |
| leave-with-makeup | `{ dates, daysCount, makeupMinutesRequired, makeupMinutesPlanned }` |
| overtime | `{ minutes, monthMinutesAfter }` |
| shift-change | `{ dates, keptDates }` |
| explanation | `{ cases }` (Task 7 thêm `needs`) |
| advance | `{ month, amount }` (Task 5 thêm `workDays`) |

Xếp thiếu giờ bù thì báo "Còn thiếu N giờ bù" (R-P10).

**`previewRequest` bắt lỗi như sau:**
- `DayConflictError` → `{ ok: false, message, code: 'DAY_CONFLICT' }`.
- `Error` không có thuộc tính `code` → `{ ok: false, message }`.
- Lỗi có `code` khác (lỗi DB) → ném lại.

**Các bước:**

- [ ] **Step 1: Viết test** dùng `makeService()`, hôm nay 2026-11-04:
  - `preview equals create without saving`:
    - Xem trước đơn nghỉ ANNUAL 13–16/11 cho `nv01`, ra:

      ```ts
      { ok: true, title: 'Phép năm 13–16/11',
        summary: { dates: ['2026-11-13','2026-11-14','2026-11-16'], daysCount: 3, annualLeaveLeftAfter: 9 },
        warnings: [] }
      ```

    - Sau đó `ctx.repo.requests.size === 0` và `day_status` giả không có dòng nào.
    - `createLeaveRequest` với cùng body trả `title` `'Phép năm 13–16/11'`, `leaveDaysCount` 3.
  - `client title is ignored`: `createOvertimeRequest({ …, title: 'X', otDate: '2026-11-12', startTime: '18:00', endTime: '20:00' })` → `title === 'Làm thêm 12/11 18–20h'`.
  - `preview returns the create error`: xem trước OT cho `tts01` → `{ ok: false, message: 'Loại nhân sự này không có OT' }`.
  - `makeup short of hours`: đơn nghỉ có làm bù 13/11, một khung 18–22 ngày 16/11 → `{ ok: false, message: 'Còn thiếu 4 giờ bù' }`.
  - `stale preview then conflict` (Review Focus 3):
    - Xem trước đơn nghỉ 14/11 (Thứ Bảy) → `ok: true`.
    - `seed(ctx, isatRequest('2026-11-14','PENDING'))`.
    - `createLeaveRequest` cùng body → rejects với `DayConflictError`.
    - Xem trước lại → `ok: false`, `code: 'DAY_CONFLICT'`, `message` khớp `/đang có đơn iSAT chờ duyệt/`.
- [ ] **Step 2:** Chạy `requests-preview.test.ts`. Expected: FAIL (`previewRequest is not a function`).
- [ ] **Step 3:** Tách các planner, viết `fileRequest` và `previewRequest`, đặt tiêu đề phía server.
- [ ] **Step 4:** Chạy `node --import tsx --test "test/v2/requests-*.test.ts"`. Sửa assertion `title` và câu giờ bù cũ ở các file test sẵn có theo hành vi mới. Expected: PASS.
- [ ] **Step 5:** Commit `feat(requests): plan/save split, server titles and preview`.

---

### Task 4: Luật khi nhân viên tự nộp (`filedBy: 'self'`)

**Files:**
- Modify: `src/modules/requests/requests.service.ts`
- Modify: `src/modules/requests/requests.module.ts` (import `SystemModule`)
- Modify: `test/v2/helpers/requests-fakes.ts`
- Test: `test/v2/requests-self-filing.test.ts`

**Interfaces — Consumes:** `filingWindow`, `isWholeHour`, `isClosedPeriod`.

**Interfaces — Produces:**
- Hàm khởi tạo của `RequestsService` thêm tham số thứ 6: `@Optional() @Inject(SystemService) private readonly periods?: Pick<SystemService, 'getPeriod'>`.
- `protected isClosedMonth(month: string): Promise<boolean>`. Không có `periods` thì trả false.
- Trong file fake:
  - thêm `class FakePeriods { statuses = new Map<string, string>(); getPeriod(month): Promise<{ month: string; status: string } | null> }`;
  - `makeService()` truyền `FakePeriods` vào và trả thêm `periods`.

**Luật khi `filedBy === 'self'`** (route Admin giữ hành vi cũ):

| Luật | Áp cho | Câu báo |
|---|---|---|
| Mọi ngày nằm trong `filingWindow(today)` | Ngày bắt đầu/kết thúc của đơn nghỉ, nghỉ có làm bù, đổi ca; ngày của khung bù; ngày OT | `Chỉ chọn ngày từ 04/11 đến 31/12` |
| Tháng của các ngày đó chưa chốt | Như trên | `Tháng 11 đã chốt công` (số tháng không có số 0 đầu) |
| Giờ là giờ tròn | Giờ bắt đầu và kết thúc của OT và của khung bù | `Chỉ chọn giờ tròn` |

**Các bước:**

- [ ] **Step 1: Viết test**, tất cả gọi với `{ filedBy: 'self' }` trừ khi ghi khác:
  - `self dates stay inside the window`:
    - đơn nghỉ 03/11 → `'Chỉ chọn ngày từ 04/11 đến 31/12'`;
    - OT `2027-01-04` → cùng câu báo;
    - đổi ca `2026-12-30`–`2027-01-02` → cùng câu báo.
  - `admin keeps past dates`: `createLeaveRequest` ngày 02/11 không có opts → thành công.
  - `today is allowed`: OT 04/11 18:00–20:00 → thành công.
  - `self closed month`:
    - `periods.statuses.set('2026-11','calculated')`, OT 12/11 → `'Tháng 11 đã chốt công'`;
    - đặt thêm `'2026-12'` là `'attendance_locked'`, đơn nghỉ 01/12 → `'Tháng 12 đã chốt công'`.
  - `self whole hours`:
    - OT 18:30–20:00 → `'Chỉ chọn giờ tròn'`;
    - khung bù 18:30–21:30 → `'Chỉ chọn giờ tròn'` (kiểm giờ tròn chạy trước `windowError`);
    - route Admin với OT 18:30–20:00 → `otHours === 1.5`.
- [ ] **Step 2:** Chạy file test. Expected: FAIL.
- [ ] **Step 3:** Viết các kiểm tra trong planner, chỉ chạy khi `opts.filedBy === 'self'`. Thêm `SystemModule` vào `imports` của `RequestsModule`.
- [ ] **Step 4:** Chạy `"test/v2/requests-*.test.ts"`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(requests): self-filing window, closed months and whole hours`.

---

### Task 5: Tạm ứng do server tính

**Files:**
- Create: `src/modules/payroll/domain/advance-quote.ts`
- Modify: `src/modules/payroll/payroll.service.ts`
- Modify: `src/modules/requests/requests.service.ts`
- Modify: `src/modules/requests/requests.module.ts` (import `PayrollModule`)
- Modify: `src/modules/requests/requests.controller.ts` (`createAdvance` chỉ chuyển `employeeId` và `period`)
- Modify: `test/v2/helpers/requests-fakes.ts`
- Test: `test/v2/payroll-advance-quote.test.ts`, `test/v2/requests-advance.test.ts`

**Interfaces — Produces:**

```ts
// src/modules/payroll/domain/advance-quote.ts
export interface AdvanceQuote { amount: number; workDays: number; from: string; to: string }
export function advanceQuoteOf(lines: readonly DailyAttendanceLineProps[], month: string): AdvanceQuote;
// PayrollService
advanceQuote(employeeId: string, month: string): Promise<AdvanceQuote>; // generateMonthlyPayslip(...).dailyLines → advanceQuoteOf
```

- Hàm khởi tạo của `RequestsService` thêm tham số thứ 7: `@Optional() @Inject(PayrollService) private readonly payroll?: Pick<PayrollService, 'advanceQuote'>`.
- Thêm `FakePayroll` vào file fake, có các trường `quote: AdvanceQuote`, `failWith: Error | null` và `calls: Array<[string, string]>`. `makeService()` trả thêm `payroll`.

**Cách tính `advanceQuoteOf`:**
- Lấy các dòng có `date` trong khoảng `[month-01, month-15]`, `shiftCode` thuộc `NORMAL`, `FLEX` hoặc `NIGHT`, và `daySalary > 0`.
- `amount` = `Math.round(0.8 × Σ(daySalary − deductionAmount))`.
- `workDays` = số dòng lấy được.
- `from` = `${month}-01`, `to` = `${month}-15`.

**Luật của `planAdvance`** (áp cho cả hai route, trừ chỗ ghi riêng):

| # | Luật | Câu báo |
|---|---|---|
| 1 | Tháng của đơn: `self` luôn là tháng hiện tại (bỏ `input.period`); `admin` dùng `input.period`, không có thì tháng hiện tại | — |
| 2 | `self` phải đúng ngày theo `advanceDayOpen(today)` | `Chỉ nộp tạm ứng ngày 16 và 17` |
| 3 | Tháng đã có đơn ADVANCE PENDING hoặc APPROVED thì từ chối | `Tháng 11 đã có đơn tạm ứng` |
| 4 | Không có `payroll`, hoặc `advanceQuote` ném lỗi | `Chưa tính được số tiền tạm ứng` |
| 5 | `amount === 0` | `Chưa có ngày công 01–15/11` |

- Thông tin đơn: `amount` lấy từ quote (bỏ `input.amount`); `title` = `requestTitle({ kind: 'advance', month })`; `reason` = `title` (bỏ `input.reason`).
- `summary` = `{ month, amount, workDays }`.

**Các bước:**

- [ ] **Step 1: Viết test.**
  - Trong `payroll-advance-quote.test.ts`:
    - `quote sums work days 01–15`:
      - đầu vào: 12 dòng NORMAL ngày 02–14 (bỏ ngày 08), mỗi dòng `daySalary` 6000000/26 và `deductionAmount` 0;
      - thêm các dòng không được tính: một dòng `LEAVE`; một dòng NORMAL ngày 16; một dòng NORMAL có `daySalary` 0;
      - kết quả là `{ amount: 2215385, workDays: 12, from: '2026-11-01', to: '2026-11-15' }`.
    - `deductions reduce the quote`: như trên nhưng một dòng có `deductionAmount` 7212 → `amount === 2209615`.
  - Trong `requests-advance.test.ts`, dùng quote giả `{ amount: 2215385, workDays: 12, from: '2026-11-01', to: '2026-11-15' }`:
    - `advance window follows VN date` (Review Focus 1). Mỗi thời điểm dùng một `makeService()` riêng, nộp với `{ filedBy: 'self' }`:

      | `now` | Giờ VN | Kết quả |
      |---|---|---|
      | `2026-11-15T10:00:00Z` | 17:00 ngày 15 | rejects `'Chỉ nộp tạm ứng ngày 16 và 17'` |
      | `2026-11-15T17:30:00Z` | 00:30 ngày 16 | thành công |
      | `2026-11-17T16:30:00Z` | 23:30 ngày 17 | thành công |
      | `2026-11-17T17:30:00Z` | 00:30 ngày 18 | rejects |

    - `amount comes from the quote`: nộp `self` với `amount: 1, reason: 'x'` → `advanceAmount 2215385`, `title` và `reason` đều là `'Tạm ứng lương tháng 11'`.
    - `one advance per month`:
      - lần nộp thứ hai → `'Tháng 11 đã có đơn tạm ứng'`;
      - sau khi `cancelRequest` đơn thứ nhất, nộp lại được.
    - `zero amount refused`: `quote.amount = 0` → `'Chưa có ngày công 01–15/11'`.
    - `admin files any day for a given month`: hôm nay 04/11, route Admin `period: '2026-10'` → `advancePeriod === '2026-10'`, `payroll.calls` deepEqual `[[NV_UUID, '2026-10']]`.
    - `preview advance`: ngày 16, `self` → `{ ok: true, title: 'Tạm ứng lương tháng 11', summary: { month: '2026-11', amount: 2215385, workDays: 12 }, warnings: [] }`.
- [ ] **Step 2:** Chạy hai file test. Expected: FAIL.
- [ ] **Step 3:** Viết `advanceQuoteOf`, `PayrollService.advanceQuote` và `planAdvance`; sửa `createAdvance` của route Admin.
- [ ] **Step 4:** Chạy `"test/v2/requests-*.test.ts"` và `test/v2/payroll*.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(requests): advance amount computed by the server`.

---

### Task 6: Bảng `explanation_reminders` và repository

**Files:**
- Modify: `migrations/postgres/schema.sql` (thêm sau `day_status`, đúng DDL ở spec mục 3.4)
- Modify: `src/database/schema.ts` (thêm interface của bảng và khoá `explanation_reminders` trong `DB`)
- Create: `src/modules/requests/explanation-reminders.repository.ts`
- Modify: `src/modules/requests/requests.module.ts` (thêm vào providers và exports)
- Test: `test/v2/explanation-reminders.pg.test.ts`

**Interfaces — Produces:**

```ts
export interface ReminderRow { employeeId: string; date: string; remindedBy: string; remindedAt: string }
export class ExplanationRemindersRepository {
  withTransaction(trx: Kysely<DB>): ExplanationRemindersRepository;
  upsert(row: { employeeId: string; date: string; remindedBy: string; remindedAt: Date }): Promise<void>;
  listBetween(from: string, to: string, employeeId?: string): Promise<ReminderRow[]>; // work_date giảm dần
}
```

- `work_date` đọc qua `to_char(..., 'YYYY-MM-DD')`, như `dateText` của `requests.repository.ts`.
- `remindedAt` trả dạng `toISOString()`.

**Các bước:**

- [ ] **Step 1: Viết test PG** theo khung của `day-status-repository.pg.test.ts` (DB tạm, chạy toàn bộ lược đồ, gieo hai nhân viên có `uuid`):
  - `upsert keeps one row per day`:
    - ghi `(NV, '2026-10-27', ADMIN, T1)`, rồi ghi `(NV, '2026-10-27', ADMIN2, T2)`;
    - `listBetween('2026-10-01','2026-10-31', NV)` chỉ có 1 dòng, `remindedBy === ADMIN2`, `remindedAt === T2.toISOString()`.
  - `list filters by range and person`:
    - ghi các dòng NV 26/10, NV 01/11, NV2 27/10;
    - `listBetween('2026-10-01','2026-10-31')` → 2 dòng, theo ngày giảm dần;
    - thêm tham số `NV` → 1 dòng, `date === '2026-10-26'`.
- [ ] **Step 2:** `PG_TEST_URL=… node --import tsx --test test/v2/explanation-reminders.pg.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Viết DDL, kiểu bảng và repository.
- [ ] **Step 4:** Chạy lại test PG. Expected: PASS.
- [ ] **Step 5:** Commit `feat(requests): explanation_reminders table and repository`.

---

### Task 7: Ngày cần giải trình và đơn giải trình theo luật mới

**Files:**
- Create: `src/modules/requests/load-days.ts` (chuyển thân `loadDays` sang đây; `RequestsService.loadDays` chỉ gọi lại)
- Modify: `src/modules/requests/requests.repository.ts`:
  - `StaffContext` thêm `startDate: string | null` (đọc `staff.start_date`);
  - thêm `listFilingStaff(): Promise<Array<{ uuid: string; username: string; name: string }>>` (`locked_at IS NULL`, `uuid` khác null).
- Create: `src/modules/requests/explanations.service.ts`
- Modify: `requests.service.ts` (`planExplanation`; hàm khởi tạo thêm tham số thứ 8 `@Optional() @Inject(ExplanationsService) explanations?`), `requests.module.ts`
- Modify: `test/v2/helpers/requests-fakes.ts`:
  - `FakeAttendanceRepository` có `timesheets: DailyTimesheet[]` và override `listTimesheets`;
  - helper `timesheet(date, inTime, outTime, employeeId = NV_UUID)` dựng ca 08–17 với giờ theo VN;
  - thêm `FakeRemindersRepository`;
  - `staffContext()` có `startDate: null`;
  - `makeService()` dựng `ExplanationsService` và trả thêm `explanations`, `reminders`.
- Modify: `test/v2/requests-explanation.test.ts` (sửa theo luật mới)
- Test: `test/v2/requests-explanations-due.test.ts`

**Interfaces — Consumes:** `explanationCasesOf` (Task 2), `isClosedPeriod` (Task 1), `ExplanationRemindersRepository` (Task 6).

**Interfaces — Produces:**

```ts
// load-days.ts
export async function loadEmployeeDays(
  stores: { requests: RequestsRepository; holidays?: HolidaysRepository; days?: DayStatusRepository },
  staff: StaffContext, from: string, to: string
): Promise<{ days: EmployeeDays; active: SystemRequest[]; holidays: Holiday[] }>;
// explanations.service.ts
export interface DueDay { date: string; cases: ExplanationCase[]; needs: ExplanationNeeds; remindedAt: string | null }
export type DueCheck = { ok: true; cases: ExplanationCase[]; needs: ExplanationNeeds } | { ok: false; message: string };
export interface ExplanationView {
  id: string; status: RequestStatus; sentAt: string; cases: ExplanationCase[];
  actualCheckIn: string | null; actualCheckOut: string | null;
}
@Injectable() export class ExplanationsService {
  now: () => Date;
  constructor(requests: RequestsRepository, attendance: AttendanceRepository, holidays: HolidaysRepository,
              days: DayStatusRepository, reminders: ExplanationRemindersRepository, @Optional() periods?: SystemService);
  dueDays(employeeIdOrUsername: string): Promise<DueDay[]>;                 // mới nhất trước
  checkDay(employeeIdOrUsername: string, date: string): Promise<DueCheck>;
  dayView(employeeIdOrUsername: string, date: string): Promise<{
    explanation: ExplanationView | null; due: { cases: ExplanationCase[]; needs: ExplanationNeeds; remindedAt: string | null } | null;
  }>;
}
```

**`dueDays` làm theo các bước:**
1. Khoảng xét: `from` = max(ngày 01 của tháng trước, `startDate`); `to` = hôm nay.
2. Đọc dữ liệu: `loadEmployeeDays`, timesheet của khoảng, đơn `EXPLANATION`, lời nhắc của khoảng, trạng thái kỳ lương của từng tháng.
3. Với mỗi ngày D, bỏ qua D khi gặp một trong các điều kiện:
   - tháng của D đã chốt;
   - D không phải ngày làm, tức là `shiftOf(D) === null`, hoặc `isHoliday(D)`, hoặc `isOnLeave(D)`, hoặc `claimOn(D)?.status === 'ISAT'`;
   - D đã có đơn giải trình PENDING, APPROVED hoặc REJECTED.
4. Phát hiện trường hợp:
   - ca lấy từ `shiftOf(D)`;
   - giờ vào/ra lấy từ `actualCheckIn` / `actualCheckOut` của timesheet;
   - `hasOt` = `windowsOn(D).some(w => w.kind === 'OT')` (R-P2).
5. Giữ D khi có ít nhất một trường hợp.

**`checkDay`:** kiểm theo thứ tự ở R-P4. Câu báo:

| Tình huống | Câu báo |
|---|---|
| Ngày tương lai | `Không giải trình cho ngày trong tương lai` |
| Tháng đã chốt | `Tháng 11 đã chốt công` |
| Không phải ngày làm | `Ngày 01/11 không phải ngày làm` |
| Đã có đơn | `Ngày 03/11 đã có đơn giải trình` |
| Không có trường hợp | `Ngày 04/11 không có gì cần giải trình` |

**`planExplanation`** (cả hai route):
1. Gọi `checkDay`; kết quả không ok thì ném câu báo đó.
2. Giữ kiểm tra trùng đơn trong khoá như hiện tại.
3. `cases` lấy từ kết quả kiểm; `input.cases` bị bỏ qua.
4. Giờ thực tế:
   - `needs.checkIn` mà thiếu giờ vào → `Nhập giờ vào thực tế`;
   - `needs.checkOut` mà thiếu giờ ra → `Nhập giờ ra thực tế`;
   - giờ không cần thì ghi `null`;
   - ca không qua đêm và giờ ra < giờ vào → `Giờ ra không được trước giờ vào` (R-P5; bằng nhau vẫn nhận, người dùng chốt 06/11).
5. `summary` = `{ cases, needs }`.

**Các bước:**

- [ ] **Step 1: Viết test** dùng `makeService()`, hôm nay 2026-11-04. Mặc định hồ sơ `nv01` có `startDate '2026-11-02'`; timesheet 03/11 vào 08:40 ra 17:05; timesheet 02/11 vào 08:00, không có giờ ra.
  - `due days come from punches, newest first`: `dueDays('nv01')` deepEqual

    ```ts
    [{ date: '2026-11-03', cases: ['LATE_CHECK_IN'], needs: { checkIn: false, checkOut: false }, remindedAt: null },
     { date: '2026-11-02', cases: ['MISSING_CHECK_OUT'], needs: { checkIn: false, checkOut: true }, remindedAt: null }]
    ```

  - `explained days drop out, cancelled ones come back`:
    - `seed` đơn `explanationRequest('2026-11-03', ['LATE_CHECK_IN'], 'REJECTED')` → 03/11 không còn trong danh sách;
    - đơn đó ở trạng thái `'CANCELLED'` → 03/11 có trong danh sách.
  - `holiday, leave and closed months are skipped`:
    - ngày lễ 02/11 → còn mỗi 03/11;
    - đơn nghỉ APPROVED 03/11 → còn mỗi 02/11;
    - `periods '2026-11'` đã chốt → `[]`.
  - `range starts the first day of last month`: `startDate: null`, không có timesheet nào → 29 phần tử, phần tử cuối có `date === '2026-10-01'` và cases `['MISSING_CHECK_IN','MISSING_CHECK_OUT']`.
  - `check messages`:
    - `checkDay('nv01','2026-11-05')` → `'Không giải trình cho ngày trong tương lai'`;
    - với `startDate: '2026-11-01'`, ngày `'2026-11-01'` → `'Ngày 01/11 không phải ngày làm'`;
    - ngày 04/11 có timesheet vào 08:00 → `'Ngày 04/11 không có gì cần giải trình'`;
    - có đơn PENDING ngày 03/11 → `'Ngày 03/11 đã có đơn giải trình'`;
    - kỳ `'2026-11'` đã chốt → `'Tháng 11 đã chốt công'`.
  - `dayView`:
    - ngày 02/11 → `due` deepEqual `{ cases: ['MISSING_CHECK_OUT'], needs: {…}, remindedAt: null }`, `explanation === null`;
    - sau khi nộp giải trình 02/11 → `due === null`, `explanation.status === 'PENDING'`.
  - Trong `requests-explanation.test.ts`:
    - `cases come from punches`: route Admin, ngày 02/11, `cases: ['LATE_CHECK_IN']`, `actualCheckOut: '17:30'` → `explanationCases` deepEqual `['MISSING_CHECK_OUT']`, `title === 'Giải trình 02/11'`;
    - `missing out requires the time`: thiếu `actualCheckOut` → `'Nhập giờ ra thực tế'`;
    - `unneeded times are dropped`: ngày 03/11 gửi kèm `actualCheckIn '08:00'` → `actualCheckIn === null`;
    - `admin is refused on closed months`: kỳ đã chốt → `'Tháng 11 đã chốt công'`.
- [ ] **Step 2:** Chạy hai file test. Expected: FAIL.
- [ ] **Step 3:** Viết `loadEmployeeDays`, `ExplanationsService` (`dueDays`, `checkDay`, `dayView`), `listFilingStaff`, `StaffContext.startDate` và `planExplanation`.
- [ ] **Step 4:** Chạy `"test/v2/requests-*.test.ts"`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(requests): explanation due days and server-derived cases`.

---

### Task 8: Lời nhắc và route Admin

**Files:**
- Modify: `src/modules/requests/explanations.service.ts`
- Modify: `src/modules/requests/requests.controller.ts`
- Modify: `test/v2/auth-access.test.ts`
- Test: `test/v2/requests-explanation-reminders.test.ts`

**Interfaces — Produces:**

```ts
export interface DueItem extends DueDay { employeeId: string; name: string }
// ExplanationsService
listDue(): Promise<DueItem[]>;   // listFilingStaff → dueDays; sắp ngày giảm dần, rồi theo tên
remind(employeeIdOrUsername: string, date: string, adminIdOrUsername: string): Promise<{ remindedAt: string }>;
reminders(employeeIdOrUsername: string): Promise<Array<{ date: string; remindedAt: string }>>; // dueDays có remindedAt
// RequestsController
@RequireCap('requests.review') @Get('explanations-due') listExplanationsDue(): Promise<{ items: DueItem[] }>;
@RequireCap('requests.review') @Post('explanations-due/remind')
remindExplanation(@Body() body, @CurrentUser() user): Promise<{ reminded: true; remindedAt: string }>;
```

**`remind`:**
1. Gọi `checkDay`; kết quả không ok thì ném câu báo đó.
2. Đổi admin sang uuid qua `findStaffContext(admin, month)`.
3. `upsert` với `remindedAt = this.now()`.

**Controller:**
- Đọc `employeeId` bằng `requireEmployeeId(body)` và `date` bằng `requireDateText`.
- Lỗi trả 400 `BAD_REQUEST`.
- Hai route mới đặt trước `@Get(':id')`.
- Thêm `'listExplanationsDue'` và `'remindExplanation'` vào danh sách `RequestsController` trong bảng auth-access.

**Các bước:**

- [ ] **Step 1: Viết test** (cùng dữ liệu gieo như Task 7):
  - `remind then remind again overwrites`:
    - `now = 2026-11-04T02:40:00Z`, `remind('nv01','2026-11-02','admin')` → `reminders('nv01')` deepEqual `[{ date: '2026-11-02', remindedAt: '2026-11-04T02:40:00.000Z' }]`;
    - nhắc lại lúc `03:10Z` → `remindedAt` là `'2026-11-04T03:10:00.000Z'`, kho chỉ có 1 dòng.
  - `cannot remind an explained day`: có đơn PENDING ngày 02/11 → rejects `'Ngày 02/11 đã có đơn giải trình'`.
  - `cancelled explanation brings the reminder back` (Review Focus 4):
    - nhắc ngày 02/11;
    - nộp giải trình 02/11 → `reminders('nv01')` deepEqual `[]`;
    - `cancelRequest(id, 'nv01')` → lời nhắc của 02/11 hiện lại.
  - `listDue names every person`: hai hồ sơ (`nv01` "Nguyễn Văn A", `nv02` "Trần Thị B"), mỗi người một ngày cần giải trình → `items.map(i => [i.name, i.date])` đúng thứ tự.
  - `remind route needs employeeId`: `RequestsController.remindExplanation({ date: '2026-11-02' }, user)` → `BadRequestError` `'Thiếu employeeId của nhân viên'`.
  - `auth-access`: bảng có thêm hai dòng, test sẵn có vẫn pass.
- [ ] **Step 2:** Chạy file test và `auth-access.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Viết `listDue`, `remind`, `reminders` và hai route.
- [ ] **Step 4:** Chạy lại. Expected: PASS.
- [ ] **Step 5:** Commit `feat(requests): explanation reminders and admin routes`.

---

### Task 9: `requestContext` và số phép dùng chung

**Files:**
- Modify: `src/modules/requests/requests.service.ts`
- Create: `src/modules/requests/domain/request-context.ts` (kiểu DTO)
- Test: `test/v2/requests-filing-context.test.ts`

**Interfaces — Consumes:** `filingWindow`, `dayHourOptions`, `advanceDayOpen`, `annualLeaveLeftOf`, `isClosedPeriod`, `ExplanationsService.dueDays`, `payroll.advanceQuote`.

**Interfaces — Produces:**

```ts
export interface RequestContextDTO {
  today: string; window: { from: string; to: string };
  kinds: Array<{ kind: FilingKind; enabled: boolean; reason?: string }>;
  months: Array<{ month: string; closed: boolean; otMinutes: number; otCapMinutes: 2400; hasOvertime: boolean; hasMakeupLeave: boolean }>;
  leaveTypes: Array<{ code: LeaveType; label: string }>;
  annualLeaveLeft: number | null;
  shiftFrames: Array<{ shiftType: FrameShiftType; start: string; end: string }>;
  days: Array<{ date: string; workday: boolean; shift: { start: string; end: string } | null; holiday: string | null;
                claim: { status: ClaimStatus; pending: boolean } | null; hours: HourOption[] }>;
  explanationDays: DueDay[];
  advance: (AdvanceQuote & { month: string }) | null;
}
// RequestsService
requestContext(employeeIdOrUsername: string): Promise<RequestContextDTO>;
annualLeaveLeft(employeeIdOrUsername: string): Promise<number | null>;
```

**Các trường:**
- `days`: mọi ngày trong `window`.
  - `workday` = `isWorkingDay`.
  - `shift` lấy từ `shiftOf` (R-P1).
  - `holiday` là tên ngày lễ.
  - `hours` là `[]` khi `isOnLeave`; ngược lại dùng `dayHourOptions({ date, shifts: shiftsAround(date), hasShift: shiftOf(date) !== null, windows: windowsOn(date) })`.
- `months`: tháng này và tháng sau.

**`kinds`** theo thứ tự `leave`, `leave-with-makeup`, `overtime`, `shift-change`, `explanation`, `advance`:

| Loại | Có mặt khi | Được bật khi | `reason` khi khoá |
|---|---|---|---|
| leave | luôn có | luôn bật | — |
| leave-with-makeup | `benefits.makeup` | có tháng chưa chốt và chưa có OT | `Không còn ngày đăng ký được` |
| overtime | `benefits.ot` | có tháng chưa chốt, chưa có Nghỉ có làm bù và `otMinutes < 2400` | `Không còn ngày đăng ký được` |
| shift-change | luôn có | có tháng chưa chốt | `Không còn ngày đăng ký được` |
| explanation | luôn có | `explanationDays.length > 0` | `Không có ngày cần giải trình` |
| advance | luôn có | xem bên dưới | xem bên dưới |

`advance` xét theo thứ tự; gặp điều kiện nào trước thì khoá với lý do tương ứng:
1. Không phải ngày 16 hay 17 → `Chỉ nộp ngày 16 và 17`.
2. Tháng đã có đơn tạm ứng → `Tháng 11 đã có đơn tạm ứng`.
3. `advanceQuote` lỗi → `Chưa tính được số tiền tạm ứng`.
4. `amount` bằng 0 → `Chưa có ngày công 01–15/11`.
5. Qua hết thì bật, và `advance` = `{ month, …quote }`.

**Các bước:**

- [ ] **Step 1: Viết test**, hôm nay 2026-11-04 và hồ sơ `nv01` có `startDate '2026-11-04'` trừ khi ghi khác:
  - `window and days`:
    - `window` deepEqual `{ from: '2026-11-04', to: '2026-12-31' }`, `days.length === 58`;
    - `days[0]` deepEqual `{ date: '2026-11-04', workday: true, shift: { start: '08:00', end: '17:00' }, holiday: null, claim: null, hours: <5 lựa chọn của Task 1> }`;
    - ngày `'2026-11-08'` có `workday: false`, `shift: null`, `hours[0].start === 6`.
  - `kinds follow benefits`:
    - `nv01` → các kind theo đúng thứ tự trên;
    - `tts01` không có `overtime`, `leaveTypes` không có `ANNUAL`, `annualLeaveLeft === null`;
    - `nv01` có `annualLeaveLeft === 12`.
  - `advance locked outside 16–17`: kind `advance` là `{ enabled: false, reason: 'Chỉ nộp ngày 16 và 17' }`, `advance === null`.
  - `advance open on the 16th`: `now = 2026-11-16T03:00:00Z` → `advance` deepEqual `{ month: '2026-11', amount: 2215385, workDays: 12, from: '2026-11-01', to: '2026-11-15' }`.
  - `advance quote failure only locks advance` (Review Focus 5): ngày 16, `payroll.failWith = new Error('Thiếu bậc lương')` → hàm vẫn trả kết quả; `advance` là `{ enabled: false, reason: 'Chưa tính được số tiền tạm ứng' }`; mọi kind khác đều bật.
  - `explanation locked when nothing is due`: `explanation` là `{ enabled: false, reason: 'Không có ngày cần giải trình' }`, `explanationDays` là `[]`.
  - `months and held days`:
    - `seed` OT APPROVED 12/11 18–20 → `months[0]` deepEqual `{ month: '2026-11', closed: false, otMinutes: 120, otCapMinutes: 2400, hasOvertime: true, hasMakeupLeave: false }`; `leave-with-makeup` vẫn bật (nhờ tháng 12);
    - `seed` đơn nghỉ PENDING 13/11 → ngày 13 có `claim: { status: 'LEAVE', pending: true }`, `hours: []`.
  - `closed month`: kỳ `'2026-11'` là `'attendance_locked'` → `months[0].closed === true`.
- [ ] **Step 2:** Chạy file test. Expected: FAIL.
- [ ] **Step 3:** Viết `requestContext` và `annualLeaveLeft`.
- [ ] **Step 4:** Chạy `"test/v2/requests-*.test.ts"`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(requests): request context for staff forms`.

---

### Task 10: Route `/me` và tài liệu API

**Files:**
- Modify: `src/modules/me/me.controller.ts`
- Modify: `test/v2/me-controller.test.ts`
- Modify: `test/v2/auth-access.test.ts`
- Modify: `docs/api/v2-contract.md` (mục 3.4 và phần `/me`)

**Interfaces — Consumes:** `requestContext`, `previewRequest`, `annualLeaveLeft`, và các hàm `create*` nhận `opts` (Task 3–9); `ExplanationsService.reminders`, `dayView`.

**Interfaces — Produces** (trong `MeController`):
- `@Authenticated() @Get('request-context') requestContext(req)`.
  - Lỗi trả 400 `BAD_REQUEST`.
- `@Authenticated() @Post('requests/:kind/preview') previewRequest(req, kind, body)`.
  - `kind` không thuộc 6 `FilingKind` (gồm cả `isat`) → 404 `REQUEST_KIND_NOT_FOUND`.
  - Ngược lại trả `previewRequest(kind, { ...body, employeeId: me.username }, { filedBy: 'self' })`.
- `createRequest`: 6 loại trong `CREATE` truyền `{ filedBy: 'self' }`; `isat` giữ như cũ.
- `today`: thêm `reminders: await explanations.reminders(me.username).catch(() => [])` (R-P7).
- `attendanceDay`: trộn thêm `...await explanations.dayView(me.username, date)`.
- `profile`: `leave: { ...contract.leave, remainingDays: (await requests.annualLeaveLeft(me.username)) ?? 0 }`.
- Hàm khởi tạo thêm `@Inject(ExplanationsService) explanations`.
- Bảng auth-access thêm `'requestContext'` và `'previewRequest'` vào danh sách `MeController`.

**Các bước:**

- [ ] **Step 1: Viết test** theo kiểu service giả của `me-controller.test.ts`:
  - `preview uses the session user and self filing`: body có `employeeId: 'mallory'` → service nhận `('leave', { …, employeeId: 'nam' }, { filedBy: 'self' })`.
  - `preview of isat or unknown kind is 404`.
  - `create passes self filing`: `opts` deepEqual `{ filedBy: 'self' }` cho cả 6 loại.
  - `today lists reminders`:
    - service giả trả `[{ date: '2026-10-27', remindedAt: '…' }]` → có trong `reminders`;
    - service ném lỗi → `reminders` là `[]`.
  - `attendance day adds explanation and due`.
  - `profile leave left comes from annualLeaveLeft`: service trả 8 → `leave.remainingDays === 8`; trả `null` → 0.
- [ ] **Step 2:** Chạy `me-controller.test.ts` và `auth-access.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Viết các route. Ghi vào `docs/api/v2-contract.md`:
  - các route `request-context`, `preview`, `explanations-due`, `remind`;
  - các trường mới của `today`, `attendance/:date`, `profile`;
  - luật `self` và tiêu đề do server đặt.
- [ ] **Step 4:** Chạy `PG_TEST_URL=… npm test`. Expected: PASS toàn bộ BE.
- [ ] **Step 5:** Commit `feat(me): request context, preview, reminders and explanation day view`.

---

### Task 11: Nối FE (bản mock của phiên khác) với BE

FE trên dữ liệu giả do phiên khác làm, ở nhánh `claude/staff-requests-fe-mock` theo plan `docs/superpowers/plans/2026-11-05-staff-requests-fe-mock.md`. Các hàm dịch vụ mới của phiên đó trả `notConnected()` khi không ở chế độ mock. Người dùng nói ở phiên đó: "làm phần mock trước, nối API thì để BE". Task này thay các nhánh `notConnected()` bằng lời gọi route thật.

**Phụ thuộc:** nhánh `claude/staff-requests-fe-mock` đã vào `main`.
- Kiểm bằng `git merge-base --is-ancestor claude/staff-requests-fe-mock main`.
- Chưa vào thì dừng sau Task 10. Báo người dùng phần BE đã xong và task này còn chờ.
- Đã vào thì `git merge main` trước khi làm.

**Files** (đọc lại tên thật sau khi merge; dưới đây theo plan của phiên kia):
- Modify: `web/src/services/staff-requests.ts`: nhánh máy chủ thật của `getRequestContext`, `previewRequest`, `createRequest`, `cancelRequest`.
- Modify: `web/src/builders/api/staff-phone.ts`:
  - `homeViewOf` lấy `reminders` từ `t.reminders` của `/me/today`;
  - `dayDetailOf` lấy `due` từ `/me/attendance/:date`.
- Modify: `web/src/builders/api/inbox.ts` (thêm `inboxFromDue`), `web/src/services/admin-main.ts`:
  - `getInbox` đọc thêm `/requests/explanations-due`;
  - `resolveRequest(id, 'remind')` gọi route nhắc.
- Test: `test/v2/fe-staff-phone-builders.test.ts`, `test/v2/fe-api-builders.test.ts`, `test/v2/fe-staff-requests-service.test.ts`.

**Interfaces — Consumes:**
- Từ BE (Task 9–10): `GET /me/request-context`, `POST /me/requests/:kind/preview`, `POST /me/requests/:kind`, `PATCH /me/requests/:id/cancel`, `GET /requests/explanations-due`, `POST /requests/explanations-due/remind`.
- Từ FE mock: hình dạng `RequestContext` và `PreviewResult` (spec mục 2.1, 2.2). Thân đơn dùng đúng tên trường của BE.

**Interfaces — Produces:**

```ts
// services/staff-requests.ts, nhánh máy chủ thật
getRequestContext(): Promise<RequestContext>;                   // api.get('/me/request-context')
previewRequest(kind, draft): Promise<PreviewResult>;              // api.post(`/me/requests/${kind}/preview`, draft)
createRequest(kind, draft): Promise<{ id: string }>;              // api.post(`/me/requests/${kind}`, draft)
cancelRequest(id: string): Promise<void>;                         // api.patch(`/me/requests/${id}/cancel`, {})
// builders/api/inbox.ts
export function inboxFromDue(items: Array<{ employeeId: string; name: string; date: string; cases: string[];
  needs: { checkIn: boolean; checkOut: boolean }; remindedAt: string | null }>, people: Map<string, PersonInfo>, now: number): InboxItem[];
```

- `createRequest` lấy `id` từ thân trả về của `createdBody`. Đọc `request-http.ts` để biết đúng chỗ của `id`.
- Việc trong chuông do `inboxFromDue` dựng:
  - `id` = `due:<employeeId>:<date>`, `group: 'att'`, `action: 'remind'`;
  - mang theo `employeeId` và `remindedAt`;
  - `what` = `caseText(cases)` của builder phía FE mock.
- `resolveRequest(id, 'remind')` (máy chủ thật):
  - gửi `POST /requests/explanations-due/remind` với `{ employeeId, date }` lấy từ việc đã đọc;
  - trả lại việc đó, có `remindedAt` mới; việc không rời chuông.
- Số trên chuông không đổi (R-P8).

**Các bước:**

- [ ] **Step 1: Viết test.**
  - `fe-staff-requests-service.test.ts`: thay `api` bằng bản giả ghi lại lời gọi; chạy với `__MOCK__ = false`.
    - Bốn hàm gọi đúng phương thức và đường dẫn.
    - `createRequest('leave', draft)` trả `{ id }` lấy từ thân trả về.
    - Cách thay `api` theo kiểu các test `fe-*` hiện có. Không thay được thì chuyển phần này sang test builder, và ghi `Ruling:` vào plan.
  - `homeViewOf` với `reminders: [{ date: '2026-10-24', remindedAt: '2026-10-27T02:40:00.000Z' }]` → `reminders[0].text === 'Admin nhắc giải trình 24/10'`.
  - `dayDetailOf`:
    - với `due: { cases: ['MISSING_CHECK_OUT'], needs: { checkIn: false, checkOut: true }, remindedAt: null }` → `due` giữ nguyên;
    - với `due: null` → `null`.
  - `inboxFromDue`:
    - một mục thiếu cả hai giờ → `id === 'due:u1:2026-10-27'`, `group === 'att'`, `action === 'remind'`, `what === 'Quên chấm công'`;
    - `remindedAt` giữ nguyên.
- [ ] **Step 2:** Chạy các file test trên. Expected: FAIL.
- [ ] **Step 3:** Viết các nhánh máy chủ thật và `inboxFromDue`.
- [ ] **Step 4:** Chạy lại các test node, rồi `PW_PORT=4255 npm --prefix web run test:ui`. Expected: PASS (chế độ mock không đổi).
- [ ] **Step 5:** Commit `feat(web): wire staff requests and bell reminders to the v2 API`.

**Chưa kiểm được trong task này:** luồng chạy trên BE thật bằng `web/tests/api/`.
- Bộ test đó cần một BE đang chạy trên DB thử, và mật khẩu admin của chính DB thử đó. Không dùng mật khẩu trong `deploy/secrets/luong.env`.
- Chỉ chạy khi người dùng cho cách lấy mật khẩu đó. Không chạy được thì ghi vào báo cáo.

---

### Task 12: Xác minh toàn bộ

**Files:** không sửa file.

- [ ] Chạy toàn bộ BE: `PG_TEST_URL=postgres://postgres@127.0.0.1:55465/postgres npm test`. Expected: 0 fail. Ghi số test so với mốc ở Task 0.
- [ ] Chạy toàn bộ FE: `PW_PORT=4255 npm --prefix web run test:ui`. Expected: 0 fail.
- [ ] Tắt container: `docker stop luong-test-pg-staff-requests` (chỉ container của phiên này).
- [ ] Ghi kết quả vào báo cáo:
  - lệnh đã chạy, số pass/fail;
  - các Ruling R-P1…R-P10 (trừ R-P9, đã bỏ);
  - những gì chưa kiểm:
    - route `/me` mới chưa có test HTTP trên PostgreSQL thật, ngoài test PG của bảng nhắc;
    - luồng FE trên BE thật (`web/tests/api/`), nếu chưa chạy ở Task 11.

---

## Phụ lục: các quyết định đã đưa ra khi thực thi (05/11/2026)

Ledger thực thi là thư mục nháp và sẽ bị xoá; các quyết định ở đây là bản giữ lại. Mỗi dòng gồm: quyết định, lý do, cái giá nếu sai.

**Trước khi chạy:**
- **P1:** giờ OT/bù ca đêm tính theo phút làm (4 giờ làm thì nghỉ 1 giờ), nên 08–13 được tính là 4 giờ — theo spec 2.1, `dayCapError` đếm phút làm — nếu người dùng muốn đếm giờ đồng hồ, nhân viên ca đêm sẽ được mời chọn 08–13.
- **P2:** khi Admin nhắc giải trình, máy tìm Admin bằng `resolveStaffUuid` như lúc duyệt đơn, vì Admin có thể không có cấu hình loại nhân sự — nếu sai: không có hại gì.
- **P3:** `makeService()` dựng `ExplanationsService` trên cùng bộ dữ liệu giả và cùng đồng hồ — nếu sai: chỉ đổi cách nối trong test.
- **P4:** bỏ qua Task 11 (nối FE), vì nhánh FE trên dữ liệu giả chưa vào main — nếu sai: làm Task 11 sau khi nhánh đó vào main.

**Trong lúc chạy:**
- **T3a** (đã thay): `annualLeaveLeftAfter` bằng null với loại nghỉ không phải phép năm, theo spec 2.2.
- **T3b:** ngày trong phần tóm tắt xếp tăng dần; cảnh báo dùng lại các câu đã có — nếu sai: FE đổi cách hiển thị.
- **T4a:** khi nhân viên tự nộp, máy kiểm ngày đầu và ngày cuối của đơn nghỉ, đơn nghỉ có làm bù và đơn đổi ca, từng ngày bù, và ngày OT; thứ tự kiểm: giờ tròn → khoảng ngày → tháng đã chốt — nếu sai: chỉ thừa một bước kiểm.
- **T5a:** gọi tính tiền ứng bằng uuid; "một đơn mỗi tháng" đếm đơn chờ và đơn đã duyệt, kiểm trong khoá; tạm ứng không xét tháng đã chốt — nếu sai: chỉ đổi câu báo hoặc thêm một bước kiểm.
- **T7a:** cách nối `ExplanationsService`; câu báo khi chưa nối là "Chưa cấu hình giải trình" — nếu sai: chỉ đổi cách nối.
- **Task 7 (gác lại):** giờ ra của ca đêm đang được ghi vào ngày D+1, nên ca 22–07 bị báo nhầm là cần giải trình. Đây là luật chấm công (L21), đã sửa ở nhánh chấm công — cho tới khi bản sửa đó vào main, nhân viên ca đêm sẽ thấy ngày cần giải trình nhầm.
- **X1:** tạm giữ `explanationCasesOf`; đổi sang `detectCases` khi hàm đó vào main — cho tới lúc đó, máy chưa báo trường hợp ra muộn.
- **T8a:** chuông Admin bỏ qua người có hồ sơ lỗi, ví dụ thiếu cấu hình loại nhân sự — nếu sai: người đó vắng khỏi chuông mà không ai biết.
- **T9a:** `request-context` xét hai tháng: tháng này và tháng sau; một loại đơn mở khi ít nhất một trong hai tháng còn hợp lệ; dùng cấu hình loại nhân sự của tháng này — nếu sai: một loại đơn bật/tắt khác đi trong một tháng.
- **T10a, T10b:** nếu phần giải trình hoặc phần phép năm lỗi, màn ngày và màn hồ sơ vẫn hiện, với giá trị dự phòng — nếu sai: màn hiện giá trị cũ cho tới khi sửa cấu hình.
- **M1:** không gộp vào main theo lời nhắn chuyển qua từ phiên khác; hỏi thẳng người dùng ở phiên này.

**Sau review toàn nhánh:**
- **F1:** Thứ Bảy đã có iSAT (chờ duyệt hoặc đã duyệt) không còn hiện giờ OT/bù, vì nộp vào ngày đó sẽ bị từ chối.
- **F5:** xung đột ngày khi nộp trả 400 `DAY_CONFLICT`, khớp contract hiện có; đã sửa chữ "409" trong spec và plan.
- **F4 (chờ người dùng):** số tiền ứng hiện cộng tiền ngày đã làm tròn trên phiếu lương, nên lệch ví dụ trong spec khoảng 2–6 ₫ — luật tiền, nên chưa đổi code.
- **F7:** tính tiền ứng trước khi vào khoá; các câu lỗi vẫn ra theo thứ tự cũ.
- **F8:** thêm test khởi động app để kiểm các phần phụ thuộc.
- **Gác lại:** chuông Admin ghi một dòng log mỗi lần tải, vì Admin mặc định không có cấu hình loại nhân sự. Giữ nguyên; việc tiếp theo: bỏ Admin khỏi `listFilingStaff`, hoặc chỉ log lỗi bất thường — cái giá: một dòng log mỗi lần tải chuông.
- **Ngoài phạm vi (có từ trước):** `src/database/database.module.ts:25` thiếu `@Inject(PG_POOL)`, nên khi app đóng, pool PostgreSQL không được đóng theo.

**Task 11 (nối FE, làm sau khi FE dữ liệu giả vào main a3049c6):**
- **T11a:** `request-context` chỉ trả giờ ca `{start, end}`; FE tự suy loại ca bằng cách so với `shiftFrames`, không đổi BE — nếu sai: "Ca hiện tại" hiện giờ trơn với ca không khớp khung nào.
- **T11b:** ngày cần giải trình vào danh sách chuông như mục `att` của mock; số trên chuông vẫn chỉ đếm đơn (R-P8) — nếu sai: Tổng quan và Chấm công cũng liệt kê ngày cần giải trình (demo invariant #49 chỉ đếm đơn).
- **T11c:** FE xét lỗi theo `code`, không theo mã HTTP (`DAY_CONFLICT` là 400, mock dùng 409) — nếu sai: không có hại gì.
- **T11d:** chỉ số "Yêu cầu chờ duyệt" ở Tổng quan chỉ đếm việc cần quyết định, như mock; dòng "Còn N việc phải xong trước khi chốt lương" đếm cả ngày cần giải trình; ô "Cần xử lý" ở Chấm công ghi "X chưa giải trình · Y yêu cầu chờ duyệt" (mock ghi "quên chấm", nhưng ngày cần giải trình còn gồm đi muộn, về sớm) — nếu sai: đổi một chữ.
- **Chưa kiểm:** chưa chạy FE với BE thật (demo e2e ở nhánh `claude/demo-db`); `getInbox` ghép ngày cần giải trình, `remindDue` và việc bỏ cổng `__MOCK__` ở `RequestCancel` không có test node.

**Đợt sửa 06/11 (sau khi gộp main 0725b1f của Lena; luật người dùng chốt D5–D8 ngày 06/11):**
- **S1:** test FE (`fe-staff-requests.test.ts`) dựng `request-context` qua `filingDayStates` của server (fixture chung `test/v2/helpers/staff-requests-fixture.ts`), nên builder FE được thử trên luật thật; test máy luật mock chuyển sang `fe-staff-requests-engine.test.ts`, có test song song mock = server qua chín biến thể — nếu sai: chỉ đổi cách dựng test.
- **S2:** Ruling: giữ việc FE chặn giờ ở các dòng khung bù (bỏ giờ dòng khác cùng ngày đã chiếm, không quá số phút còn thiếu, khoá "Thêm khung bù" khi đã đủ giờ), lọc trên bảng `hours` của BE — luật đã chốt và "chặn trước, không báo lỗi"; chỉ form biết các dòng khác nên không đưa về BE được — nếu sai: form đưa thêm giờ, BE vẫn từ chối khi xem trước.
- **S3:** Ruling: D7 bỏ việc so giờ khai với lần chấm thật còn lại; vẫn giữ R-P5 (ca ngày: giờ ra khai phải sau giờ vào khai) — đó là so hai giờ khai với nhau, không phải so với giờ chấm — nếu sai (người dùng muốn nhận mọi giờ khai): bỏ một điều kiện trong `planExplanation`.
- **S4:** Ruling: D8 (`advance_on = 0`) áp cả khi Admin nộp thay, kiểm trước cửa sổ ngày 16–17; `advance_on` null coi là được ứng, như repo nhân viên đang đọc — nếu sai: Admin vẫn nộp được cho người ngoài diện, hoặc người chưa có cờ bị khoá.
- **S5:** Ruling: `ordersThisMonth` = số đơn tạm ứng chờ duyệt hay đã duyệt của tháng (đúng tập luật "mỗi tháng một đơn" đếm) cộng đơn đang nộp, nên khi form mở được thì là 1; đơn bị từ chối hay đã huỷ không tính. `windowEnd` lấy từ cùng hằng ngày 16–17 với `advanceDayOpen` — nếu sai: FE hiện số thứ tự đơn khác đi.
- **S6:** bỏ `fitSlots`/`slotHourOptions` không ai dùng trong máy luật mock; builder FE là chỗ duy nhất lọc giờ của dòng khung bù — nếu sai: không có hại gì.
- **Chưa kiểm:** mock chưa có nhân viên ngoài diện tạm ứng (khoá D8 chỉ có test node và test BE); vẫn chưa chạy FE với BE thật.

**Cổng kỳ trước luật (06/11, điều phối giao sau khi main lên b582131):**
- **G1:** Ruling: `fileRequest` qua cổng kỳ trước tiên, trên các ngày client gửi (đọc như planner nhưng bỏ giá trị sai dạng, để planner báo sau), trước mọi kiểm tra khác: giờ tròn và khoảng nộp khi nhân viên tự nộp, tìm nhân sự, NOT_EMPLOYED, ADVANCE_NOT_ELIGIBLE, luật ngày trong khoá. Cổng trong khoá vẫn giữ để giữ khoá chia sẻ của tháng tới khi ghi xong — "PERIOD_LOCKED thắng lỗi luật" áp cho mọi lỗi luật, kể cả khoảng nộp của nhân viên — nếu sai (muốn câu "Chỉ chọn ngày từ…" thắng khi nhân viên tự nộp): chuyển `assertSelfFiling` lên trước cổng.
- **G2:** Ruling: Admin nộp cho mã nhân viên không có, vào tháng đã khoá, nhận PERIOD_LOCKED chứ không phải "không tìm thấy nhân sự", vì cổng không cần biết là ai — nếu sai: tìm nhân sự trước cổng.
- **G3 (ngoài phạm vi, chưa sửa):** đơn iSAT (`createIsatRequest`, không đi qua `fileRequest`) vẫn kiểm luật trước cổng kỳ. iSAT chỉ nhận Thứ Bảy sắp tới, nên chỉ gặp khi tháng hiện tại đã chốt công.

**R-P5 sau câu trả lời của người dùng (06/11, chuyển qua điều phối):** "giờ ra phải lớn hơn hoặc bằng giờ vào" — giữ kiểm tra giữa hai giờ khai (thay S3), nhưng giờ ra bằng giờ vào được nhận; câu lỗi đổi thành `Giờ ra không được trước giờ vào`; ca đêm vẫn không xét.
- **R1:** Ruling: mock FE (`web/src/mock/staff-requests.ts`) đổi cùng luật và cùng câu, không thêm test: dữ liệu giả không có ngày nào cần cả giờ vào lẫn giờ ra (chỉ 24/10 thiếu giờ ra, 09/10 vào muộn), nên nhánh này không chạm được từ UI — nếu sai: mock lệch BE mà không test nào bắt.
- **R2:** sửa luôn hai câu của contract đã cũ sau G1 ("cổng chỉ xét sau các luật", "xét sau mọi lỗi 400") — nếu sai: không có hại gì.
