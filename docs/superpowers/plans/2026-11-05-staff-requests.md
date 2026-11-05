# Nhân viên tạo và huỷ yêu cầu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nhân viên tạo 6 loại đơn và huỷ đơn đang chờ từ app (điện thoại và máy tính). Admin nhắc giải trình từ chuông. Nhân viên thấy lời nhắc và gửi giải trình.

**Architecture:**
- **BE:**
  - Luật thuần mới đặt ở `src/modules/requests/domain/`: `filing-rules.ts`, `explanation-detect.ts`.
  - Mỗi hàm `create*` của `RequestsService` tách thành hai bước, lập đơn và lưu, để có `previewRequest`.
  - Dịch vụ mới `ExplanationsService` lo ngày cần giải trình và lời nhắc, lưu vào bảng `explanation_reminders`.
  - `MeController` thêm route `request-context` và `preview`, và thêm trường cho `today`, `attendance/:date`, `profile`.
- **FE:**
  - Builder thuần `web/src/builders/api/staff-requests.ts`.
  - Dịch vụ `web/src/services/staff-requests.ts`, có nhánh mock.
  - Phần ruột dùng chung đặt ở `web/src/views/staff-requests/`, gắn vào tấm trượt trên điện thoại và ngăn kéo phải trên máy tính.

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

**Giao diện**
- Chỉ đưa ra lựa chọn hợp lệ (ẩn, khoá hoặc giới hạn); BE vẫn kiểm.
- Ô nhập bo góc 8px, không làm dạng viên thuốc, không đổ bóng.
- Lớp CSS trên máy tính có tiền tố `sd-`.
- Danh sách chỉ hiện phần cốt lõi.

**Chữ hiển thị** (chép đúng):
- Nút và thông báo: "Tạo yêu cầu", "Gửi yêu cầu", "Đã gửi yêu cầu", "Huỷ đơn", "Huỷ đơn này?", "Không", "Đã huỷ đơn".
- Chuông: "Nhắc giải trình", "Nhắc lại", "Đã nhắc: HH:MM DD/MM".
- Lời nhắc của nhân viên: "Admin nhắc giải trình DD/MM".
- Tạm ứng: "Chỉ nộp ngày 16 và 17", "Số tiền được ứng: …".
- Bộ đếm giờ bù: "Đã xếp x / y giờ", với y = 8 × số ngày nghỉ.

**Commit:** cuối mỗi task, message tiếng Anh dạng `feat(requests): …`, dòng cuối `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Giờ Việt Nam lúc nộp tạm ứng.** Nộp lúc 00:30 ngày 16 (giờ UTC vẫn là ngày 15) thì mở; 23:30 ngày 17 vẫn mở; 00:30 ngày 18 thì khoá. Test: Task 5, `advance window follows VN date`.
2. **Ca đêm 22–07.** Giờ OT gợi ý phải tránh cả ca đêm hôm trước lẫn ca tối nay. Giải trình phải đọc được giờ ra sáng hôm sau cho đúng ngày công. Test: Task 1 `night shift hours`, Task 2 `night shift out next morning`.
3. **Xem trước đã cũ.** Xem trước báo hợp lệ, rồi một thiết bị khác giữ mất ngày trước khi bấm Gửi. Khi đó create ném `DayConflictError` (route trả 409), và preview lần sau trả `ok:false, code:'DAY_CONFLICT'`. Test: Task 3, `stale preview then conflict`.
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
- **R-P9.** Mock cần một ngày cần giải trình. Ngày 24/10 của `nhanvien` đổi thành vào 07:52, không có giờ ra (`todo`), kèm lời nhắc lúc 09:40 27/10. Assertion đếm ngày của các test UI cũ được sửa theo. Rủi ro nếu sai: chỉ là dữ liệu giả.
- **R-P10.** Câu báo khi xếp thiếu giờ bù đổi thành "Còn thiếu N giờ bù", theo spec mục 2.2. Xếp thừa thì giữ câu cũ "Cần đúng … giờ bù, đang xếp … giờ".

---

### Task 0: Chuẩn bị nhánh

**Files:** không sửa file.

- [ ] Kiểm hai phụ thuộc (a) và (b):

```bash
git merge-base --is-ancestor claude/wire-staff-app-f5adca main && echo a-ok
for c in 179aeae 2a16f3c 6001bd5; do git merge-base --is-ancestor $c main && echo $c-ok; done
```

  Expected: in ra `a-ok` và ba dòng `…-ok`. Thiếu `a-ok` thì dừng, báo người dùng rằng nhánh staff-app chưa vào `main`, và không viết code.
- [ ] `git merge main`. Không đi thẳng được thì tạo merge commit; có xung đột thì giải xung đột, giữ thay đổi của cả hai bên.
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
   - ca không qua đêm và giờ ra ≤ giờ vào → `Giờ ra phải sau giờ vào` (R-P5).
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

### Task 11: Builder FE cho form

**Files:**
- Create: `web/src/builders/api/staff-requests.ts`
- Test: `test/v2/fe-staff-requests.test.ts`

**Interfaces — Produces:**

```ts
export type FormKind = 'leave' | 'leave-with-makeup' | 'overtime' | 'shift-change' | 'explanation' | 'advance';
export const KIND_SLUG: Record<FormKind, string>;   // nghi, nghi-bu, ot, doi-ca, giai-trinh, tam-ung
export const KIND_LABEL: Record<FormKind, string>;  // Đơn nghỉ, Nghỉ có làm bù, Làm thêm giờ, Đổi ca, Giải trình, Tạm ứng
export type RequestContext = /* đúng hình dạng RequestContextDTO của Task 9 */;
export type PreviewResult = /* đúng hình dạng của Task 3 */;
export type Option = { value: string; label: string };
export function menuOf(ctx: RequestContext): Array<{ kind: FormKind; label: string; enabled: boolean; note: string | null }>;
export function dayLabel(date: string): string;                                   // 'T6 13/11', 'CN 08/11'
export function leaveStartOptions(ctx: RequestContext, kind: 'leave' | 'leave-with-makeup'): Option[];
export function leaveEndOptions(ctx: RequestContext, kind: 'leave' | 'leave-with-makeup', start: string): Option[];
export function shiftChangeStartOptions(ctx: RequestContext): Option[];
export function shiftChangeEndOptions(ctx: RequestContext, start: string): Option[];
export function otDateOptions(ctx: RequestContext): Option[];
export function slotDateOptions(ctx: RequestContext, leaveEnd: string): Option[];
export function explanationDateOptions(ctx: RequestContext): Option[];
export function startHourOptions(day: RequestContext['days'][number], taken: Array<{ start: number; end: number }>): Option[];
export function endHourOptions(day: RequestContext['days'][number], start: number,
                               taken: Array<{ start: number; end: number }>, maxMinutes: number): Option[];
export function otUsedLine(ctx: RequestContext, month: string): string;          // 'Đã đăng ký tháng 11: 9 / 40 giờ'
export function makeupCounter(requiredMinutes: number, slotMinutes: number[]): { text: string; full: boolean };
export function leaveBalanceLine(left: number, after: number): string;
export function summaryLine(kind: FormKind, summary: Record<string, unknown>): string;
export function explanationCaseText(cases: string[]): string;
export function advanceLines(a: { amount: number; workDays: number; from: string; to: string }): { amount: string; sub: string };
```

**Luật chọn ngày** (spec mục 4.4):
- Không bao giờ có ngày thuộc tháng đã chốt.
- Đơn nghỉ:
  - "Từ ngày" là ngày có `workday` và không bị đơn nghỉ giữ (`claim.status` là LEAVE hoặc LEAVE_WITH_MAKEUP);
  - "Đến ngày" chạy từ "Từ ngày", dừng trước ngày đầu tiên bị đơn nghỉ giữ.
- Nghỉ có làm bù, thêm các điều kiện:
  - tháng chưa có OT (`hasOvertime`);
  - "Đến ngày" cùng tháng với "Từ ngày";
  - sau "Đến ngày" phải còn ít nhất một ngày trong tháng có `hours` khác rỗng.
- Làm thêm giờ: ngày có `hours` khác rỗng, tháng không có Nghỉ có làm bù, `otMinutes < 2400`.
- Ngày bù: sau `leaveEnd`, cùng tháng, có `hours` khác rỗng.

**Luật chọn giờ:**
- Giờ bắt đầu lấy từ `hours[].start`, bỏ giờ rơi vào khoảng `taken` (các khung đã chọn ở dòng khác cùng ngày).
- Giờ kết thúc lấy từ `ends` của giờ bắt đầu, dừng trước khung `taken` kế tiếp, và giữ những giờ có `minutes <= maxMinutes`.

**Nhãn trường hợp giải trình:**
- `LATE_CHECK_IN` Vào muộn, `EARLY_CHECK_IN` Vào sớm, `EARLY_CHECK_OUT` Ra sớm, `FORGOT_CHECK_OUT` Quên check-out, `MISSING_CHECK_IN` Thiếu giờ vào, `MISSING_CHECK_OUT` Thiếu giờ ra, `LATE_CHECK_OUT` Ra muộn.
- Có cả hai trường hợp thiếu giờ thì ghi "Quên chấm công".
- Các nhãn khác nối bằng ` · `.

**Các bước:**

- [ ] **Step 1: Viết test.** Dựng một `RequestContext` mẫu với hôm nay 2026-11-04, cùng ngày và giờ như Task 9.
  - `menu`:
    - ngữ cảnh tts không có dòng `overtime`;
    - dòng `advance` có `{ enabled: false, note: 'Chỉ nộp ngày 16 và 17' }`.
  - `dayLabel`: `'2026-11-13'` → `'T6 13/11'`; `'2026-11-08'` → `'CN 08/11'`.
  - `leave dates`:
    - "Từ ngày" không có 08/11 và 13/11 (ngày 13 có `claim` LEAVE);
    - tháng 12 bị khoá thì không có ngày nào của tháng 12;
    - `leaveEndOptions(…, '2026-11-10')` cho `['2026-11-10','2026-11-11','2026-11-12']`.
  - `makeup end keeps a later day`: `leaveEndOptions(ctx, 'leave-with-makeup', '2026-11-27')` có `'2026-11-29'`, không có `'2026-11-30'`.
  - `hours`:
    - ngày 05/11 có giờ bắt đầu `['06:00','18:00','19:00','20:00','21:00']`;
    - `taken [{start:18,end:20}]` → `['06:00','20:00','21:00']`;
    - giờ kết thúc với start 18, `maxMinutes 240` → `['19:00','20:00','21:00','22:00']`; với `maxMinutes 120` → `['19:00','20:00']`.
  - `lines`:
    - `otUsedLine(ctx, '2026-11')` với 540 phút → `'Đã đăng ký tháng 11: 9 / 40 giờ'`;
    - `makeupCounter(960, [360])` → `{ text: 'Đã xếp 6 / 16 giờ', full: false }`;
    - `makeupCounter(960, [480, 480])` → `full: true`;
    - `leaveBalanceLine(11, 8)` → `'Phép năm còn 11 ngày, sau đơn này còn 8'`;
    - `summaryLine('leave', { dates: ['2026-11-13','2026-11-14','2026-11-16'], daysCount: 3 })` → `'3 ngày làm việc: 13, 14 và 16/11'`;
    - `summaryLine('leave', { dates: ['2026-11-30','2026-12-01'], daysCount: 2 })` → `'2 ngày làm việc: 30/11 và 01/12'`;
    - `summaryLine('shift-change', { dates: ['2026-11-10','2026-11-11','2026-11-12'], keptDates: ['2026-11-13'] })` → `'3 ngày đổi ca: 10, 11 và 12/11 · Giữ nguyên ngày nghỉ 13/11'`;
    - `explanationCaseText(['MISSING_CHECK_IN','MISSING_CHECK_OUT'])` → `'Quên chấm công'`;
    - `explanationCaseText(['LATE_CHECK_IN','MISSING_CHECK_OUT'])` → `'Vào muộn · Thiếu giờ ra'`;
    - `advanceLines({ amount: 2215385, workDays: 12, from: '2026-11-01', to: '2026-11-15' })` → `{ amount: 'Số tiền được ứng: 2.215.385 ₫', sub: '80% lương ngày công 01–15/11 · 12 ngày' }`.
- [ ] **Step 2:** Chạy `fe-staff-requests.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Viết builder.
- [ ] **Step 4:** Chạy lại. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): staff request form builders`.

---

### Task 12: Dịch vụ FE và dữ liệu giả

**Files:**
- Create: `web/src/services/staff-requests.ts`
- Create: `web/src/mock/staff-requests.ts`
- Modify: `web/src/mock/staff-phone.ts`:
  - xuất `addMockRequest(detail: RequestDetail)` và `cancelMockRequest(id: string)`, thao tác trên `REQUESTS`;
  - đổi ngày 24/10 theo R-P9;
  - xuất `MOCK_REMINDERS`.
- Modify: các assertion đếm ngày trong `web/tests/staff-*.spec.ts` bị đổi vì R-P9.

**Interfaces — Produces:**

```ts
// services/staff-requests.ts
export function getRequestContext(): Promise<RequestContext>;
export function previewRequest(kind: FormKind, body: Record<string, unknown>): Promise<PreviewResult>;
export function createRequest(kind: FormKind, body: Record<string, unknown>): Promise<void>;
export function cancelRequest(id: string): Promise<void>;
// mock/staff-requests.ts
export function mockToday(): string;   // ?homnay=YYYY-MM-DD khi __MOCK__, không có thì MOCK_TODAY
export function mockContext(today: string): RequestContext;
export function mockPreview(kind: FormKind, body: Record<string, unknown>): PreviewResult;
export function mockCreate(kind: FormKind, body: Record<string, unknown>): void;
export function mockCancel(id: string): void;
```

**Máy chủ thật:**
- `GET /me/request-context`;
- `POST /me/requests/:kind/preview`;
- `POST /me/requests/:kind`;
- `PATCH /me/requests/:id/cancel` với body `{}`.

Lỗi `ApiError` được ném lại cho chỗ gọi.

**Mock:**
- `mockContext`:
  - ca 08–17, làm Thứ Hai đến Thứ Bảy;
  - `hours` như Task 1. Chủ nhật: giờ bắt đầu 6..21, `minutes` bằng số giờ × 60, tối đa 720;
  - `explanationDays` gồm ngày 24/10 (`MISSING_CHECK_OUT`);
  - `advance` có giá trị khi `today` là ngày 16 hoặc 17: `{ month, amount: 2215385, workDays: 12, from, to }`.
- `mockPreview`:
  - trả `summary` như mục 2.2 của spec;
  - trả `ok: false` khi xếp giờ bù chưa đủ, hoặc xin phép năm quá số còn lại.
- `mockCreate`: thêm một `RequestDetail` vào đầu danh sách, trạng thái `pend`, `statusText` "Chờ duyệt", tiêu đề theo mẫu của Task 1.
- `mockCancel`: chuyển đơn sang `status: 'rej'`, `statusText: 'Đã huỷ'`, giống cách builder đổi CANCELLED.

**Các bước:**

- [ ] **Step 1:** Viết dịch vụ và mock theo phần Interfaces. Test nằm ở Task 13–16, vì mock chỉ được kiểm qua UI.
- [ ] **Step 2:** `PW_PORT=4255 npm --prefix web run test:ui -- staff-phone staff-desktop`. Expected: PASS sau khi sửa assertion đếm ngày theo R-P9.
- [ ] **Step 3:** Commit `feat(web): staff request service and mock data`.

---

### Task 13: Luồng tạo đơn trên điện thoại (J8–J10)

**Files:**
- Create: `web/src/views/staff-requests/NewRequestBody.vue`
- Create: 6 form `web/src/views/staff-requests/{LeaveForm,MakeupLeaveForm,OvertimeForm,ShiftChangeForm,ExplanationForm,AdvanceForm}.vue`
- Create: `web/src/views/staff-requests/usePreview.ts`
- Create: `web/src/views/staff-phone/components/NewRequestSheet.vue`
- Modify: `web/src/views/staff-phone/RequestsView.vue`
- Test: `web/tests/staff-phone-new-request.spec.ts`

**Interfaces — Produces:**
- `NewRequestBody`:
  - props `{ slug: string; date: string | null }`;
  - emits `navigate(slug: string)`, `sent()`, `close()`;
  - tải `getRequestContext()` một lần;
  - `slug === 'chon'` thì hiện menu (`menuOf`); slug là loại đơn thì hiện form của loại đó, có nút "‹" để emit `navigate('chon')`.
- `usePreview(kind, body: Ref<Record<string, unknown> | null>)`:
  - trả `{ result: Ref<PreviewResult | null>, busy: Ref<boolean> }`;
  - gọi `previewRequest` sau 300ms kể từ lần sửa cuối, chỉ khi `body` khác null (form đã đủ trường);
  - bỏ kết quả của lần gọi cũ.
- Mỗi form:
  - giữ các ô theo spec mục 4.4, dùng các hàm của Task 11 để dựng lựa chọn;
  - "Gửi yêu cầu" chỉ bật khi `result.ok === true`;
  - gửi thành công thì emit `sent`;
  - `ApiError` thì hiện `e.message` ngay dưới nút Gửi và tải lại context.
- `RequestsView`:
  - `?tao=<slug>` mở `NewRequestSheet`;
  - nút "Tạo yêu cầu" `router.replace` sang `?tao=chon`;
  - `sent` → đóng sheet, `toast.success('Đã gửi yêu cầu')`, tải lại danh sách.

**Các bước:**

- [ ] **Step 1: Viết test Playwright** dùng `openPhone`, mảng `calls` phải rỗng:
  - `menu shows six kinds with advance locked`:
    - `/nv/yeu-cau?tao=chon` có 6 dòng theo thứ tự `KIND_LABEL`;
    - dòng "Tạm ứng" bị khoá và có chữ "Chỉ nộp ngày 16 và 17".
  - `leave form sends and lists the new request first`:
    - chọn Đơn nghỉ, Phép năm, Từ "T5 29/10", Đến "T6 30/10", lý do "Việc nhà";
    - dòng tóm tắt có "2 ngày làm việc: 29 và 30/10";
    - bấm "Gửi yêu cầu" → có chữ "Đã gửi yêu cầu";
    - dòng đầu danh sách có tên "Phép năm 29–30/10, Chờ duyệt".
  - `send stays off until the form is valid`: Gửi bị tắt khi chưa có lý do.
  - `overtime offers only valid hours`: ngày "T5 29/10" có giờ bắt đầu `06:00, 18:00, 19:00, 20:00, 21:00`.
  - `makeup sends only when hours are full`:
    - ô "Đến ngày" khi nghỉ từ 29/10 có "T6 30/10", không có "T7 31/10" (sau 31/10 không còn ngày trong tháng để bù);
    - nghỉ 29/10–29/10; dòng bù 30/10 18:00–22:00 → bộ đếm "Đã xếp 4 / 8 giờ", Gửi tắt;
    - danh sách ngày bù không có 01/11 (khác tháng);
    - thêm dòng bù 31/10 18:00–22:00 → "Đã xếp 8 / 8 giờ", Gửi bật.
  - `advance on the 16th shows only the amount`:
    - `/nv/yeu-cau?tao=tam-ung&homnay=2026-11-16` có chữ "Số tiền được ứng: 2.215.385 ₫" và "80% lương ngày công 01–15/11 · 12 ngày";
    - không có ô nhập số tiền hay lý do.
  - `fields have 8px corners`: `getComputedStyle(select).borderRadius === '8px'`.
- [ ] **Step 2:** `PW_PORT=4255 npm --prefix web run test:ui -- staff-phone-new-request.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Viết các component và nối vào `RequestsView`.
- [ ] **Step 4:** Chạy lại. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): staff request flow on the phone`.

---

### Task 14: Luồng tạo đơn trên máy tính (K3)

**Files:**
- Modify: `web/src/views/staff-desktop/useDesktopDetail.ts`
- Modify: `web/src/views/staff-desktop/StaffDesktopPage.vue`
- Modify: `web/src/views/staff-desktop/parts/TodayColumn.vue`
- Test: `web/tests/staff-desktop-new-request.spec.ts`

**Interfaces — Consumes:** `NewRequestBody` (Task 13).

**Interfaces — Produces:**
- `useDesktopDetail()` trả thêm `newRequest: Ref<{ slug: string; date: string | null } | null>`, đọc `tao` và `ngay` trên đường `/nv/yeu-cau`.
- `closeDetail` bỏ cả `tao` và `ngay`.
- `StaffDesktopPage` hiện `SideDrawer` (tiêu đề "Tạo yêu cầu") chứa `NewRequestBody` khi có `newRequest`.
- Nút "Tạo yêu cầu" ở `TodayColumn` đi tới `{ path: '/nv/yeu-cau', query: { tao: 'chon' } }`.

**Các bước:**

- [ ] **Step 1: Viết test** dùng fixture `staff-desktop`:
  - `Tạo yêu cầu opens the drawer menu`;
  - `back returns to the menu`;
  - `sending closes the drawer and toasts`;
  - mảng `calls` rỗng.
- [ ] **Step 2:** Chạy file test. Expected: FAIL.
- [ ] **Step 3:** Viết theo phần Interfaces. Lớp CSS mới có tiền tố `sd-`.
- [ ] **Step 4:** Chạy file test và `staff-desktop-*.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): staff request drawer on desktop`.

---

### Task 15: Điểm vào giải trình (lời nhắc ở Hôm nay, nút trong chi tiết ngày)

**Files:**
- Modify: `web/src/builders/api/staff-phone.ts`:
  - `homeViewOf` thêm `reminders` từ `t.reminders`;
  - `dayDetailOf` thêm `explainTo` khi `due` khác null.
- Modify: `web/src/mock/staff-phone.ts`:
  - kiểu `HomeView` thêm `reminders: Array<{ date: string; text: string; to: string }>`;
  - kiểu `DayDetail` thêm `explainTo: string | null`;
  - mock điền hai trường này từ `MOCK_REMINDERS` và ngày 24/10.
- Modify: `web/src/views/staff-phone/HomeView.vue`, `web/src/views/staff-desktop/parts/TodayColumn.vue` (dòng nhắc ở đầu)
- Modify: `web/src/views/staff-phone/components/DayBody.vue` (nút "Giải trình")
- Modify: `web/src/views/staff-desktop/useDesktopDetail.ts`
- Test: thêm vào `test/v2/fe-staff-phone-builders.test.ts`; `web/tests/staff-phone-new-request.spec.ts`; `web/tests/staff-desktop-new-request.spec.ts`

**Interfaces — Produces:**
- `reminders[i]` = `{ date, text: 'Admin nhắc giải trình 24/10', to: '/nv/yeu-cau?tao=giai-trinh&ngay=2026-10-24' }`.
- `explainTo` = `'/nv/yeu-cau?tao=giai-trinh&ngay=<date>'`, hoặc `null`.

**Các bước:**

- [ ] **Step 1: Viết test.**
  - Builder:
    - `homeViewOf` với `reminders: [{ date: '2026-10-24', remindedAt: '…' }]` → `reminders[0]` đúng như trên;
    - `dayDetailOf` với `due` khác null → `explainTo` đúng như trên; với `due: null` → `null`.
  - Playwright:
    - `reminder line opens the explanation form for that day`:
      - `/nv/hom-nay` có liên kết "Admin nhắc giải trình 24/10";
      - bấm vào → form Giải trình có ngày "T7 24/10" đã chọn, chữ "Thiếu giờ ra", một ô giờ ra kiểu `time`, không có ô giờ vào.
    - `day detail offers Giải trình`: `/nv/cham-cong?ngay=2026-10-24` có liên kết "Giải trình".
    - Cùng hai test này trên máy tính.
- [ ] **Step 2:** Chạy các test trên. Expected: FAIL.
- [ ] **Step 3:** Viết builder, mock và view.
- [ ] **Step 4:** Chạy lại. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): explanation entry points from reminders and day detail`.

---

### Task 16: Huỷ đơn đang chờ

**Files:**
- Modify: `web/src/views/staff-phone/components/RequestBody.vue`
- Modify: `web/src/views/staff-phone/components/RequestSheet.vue`
- Modify: `web/src/views/staff-phone/RequestsView.vue`
- Modify: `web/src/views/staff-desktop/StaffDesktopPage.vue`
- Test: `web/tests/staff-phone-new-request.spec.ts`

**Interfaces — Produces:**
- `RequestBody` hiện nút "Huỷ đơn" khi `request.status === 'pend'`.
- Bấm nút thì hiện xác nhận ngay tại chỗ: "Huỷ đơn này?" với hai nút "Huỷ đơn" và "Không".
- Xác nhận:
  - gọi `cancelRequest(id)`;
  - `toast.success('Đã huỷ đơn')`;
  - emit `changed`.
- Chỗ cha nghe `changed` thì tải lại danh sách và chi tiết.
- Lỗi thì hiện `e.message` tại chỗ.

**Các bước:**

- [ ] **Step 1: Viết test.**
  - `cancel a pending request`:
    - mở `?yc=giai-trinh-2710`, bấm "Huỷ đơn", rồi "Huỷ đơn" trong xác nhận;
    - thấy "Đã huỷ đơn";
    - dòng của đơn đổi thành "Thiếu giờ ra 27/10, Đã huỷ".
  - `Không keeps the request`.
  - `approved requests have no cancel button`: `?yc=phep-1210`.
- [ ] **Step 2:** Chạy file test. Expected: FAIL.
- [ ] **Step 3:** Viết theo phần Interfaces.
- [ ] **Step 4:** Chạy file test, `staff-phone-requests.spec.ts` và `staff-desktop-drawers.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): cancel a pending request`.

---

### Task 17: Chuông Admin: bỏ "Khai thay", nhắc rồi việc ở lại

**Files:**
- Modify: `web/src/mock/inbox.ts`:
  - `InboxItem` thêm `employeeId?: string` và `remindedAt?: string | null`;
  - thêm `remindInboxItem(id): InboxItem | null`.
- Modify: `web/src/services/admin-main.ts`:
  - `DecisionVerb` bỏ `'declare'`;
  - `resolveRequest` xử lý `'remind'`;
  - `getInbox` (máy chủ thật) đọc thêm `/requests/explanations-due`.
- Modify: `web/src/builders/api/inbox.ts` (thêm `inboxFromDue`)
- Modify: `web/src/components/shell/InboxDetail.vue`
- Modify: component đang nghe sự kiện `decided` của `InboxDetail` (tìm bằng `grep -rn "@decided" web/src`)
- Test: `web/tests/admin-bell.spec.ts`; builder test trong `test/v2/fe-api-builders.test.ts`

**Interfaces — Produces:**

```ts
export function inboxFromDue(items: Array<{ employeeId: string; name: string; date: string; cases: string[];
  needs: { checkIn: boolean; checkOut: boolean }; remindedAt: string | null }>, people: Map<string, PersonInfo>, now: number): InboxItem[];
export const remindedText = (iso: string) => string; // 'Đã nhắc: 09:40 28/10' (giờ VN)
```

**Việc dựng từ `inboxFromDue`:**
- `id` = `due:<employeeId>:<date>`, `group: 'att'`, `action: 'remind'`.
- `what` = `explanationCaseText(cases)`.
- `facts`: `[['Ngày', 'Thứ Ba 27/10'], ['Trường hợp', what], ['Giải trình', 'Chưa gửi']]`.
- `days: [date]`.

**Nhắc giải trình:**
- Mock: đặt `remindedAt = MOCK_NOW`, việc vẫn ở lại.
- Máy chủ thật: `POST /requests/explanations-due/remind` với `{ employeeId, date }`.

**`InboxDetail`:**
- Bỏ nút "Khai thay giờ vào/ra".
- Nút có tên `remindedAt ? 'Nhắc lại' : 'Nhắc giải trình'`.
- Có `remindedAt` thì hiện dòng `remindedText`.
- Sau khi nhắc, giữ nguyên việc đang chọn: không chuyển sang việc kế tiếp, vì việc chưa rời chuông.

**Các bước:**

- [ ] **Step 1: Viết test.**
  - Builder:
    - `inboxFromDue` cho đúng `id`, `group`, `what` "Quên chấm công" (khi thiếu cả hai giờ), `remindedAt`;
    - `remindedText('2026-10-28T02:40:00.000Z') === 'Đã nhắc: 09:40 28/10'`.
  - Playwright: thay test `forgotten punches offer a reminder and a stand-in entry` bằng `forgotten punches offer only a reminder that stays`:
    - việc `ib-c1` không có nút tên khớp `/Khai thay/`;
    - bấm "Nhắc giải trình" → câu báo "Đã nhắc … giải trình."; việc vẫn trong danh sách; có dòng "Đã nhắc: 09:40 28/10"; nút đổi thành "Nhắc lại".
- [ ] **Step 2:** Chạy `admin-bell.spec.ts` và test builder. Expected: FAIL.
- [ ] **Step 3:** Viết theo phần Interfaces.
- [ ] **Step 4:** Chạy `admin-*.spec.ts` và `fe-api-builders.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): bell reminds without stand-in entry`.

---

### Task 18: Xác minh toàn bộ

**Files:** không sửa file.

- [ ] Chạy toàn bộ BE: `PG_TEST_URL=postgres://postgres@127.0.0.1:55465/postgres npm test`. Expected: 0 fail. Ghi số test so với mốc ở Task 0.
- [ ] Chạy toàn bộ FE: `PW_PORT=4255 npm --prefix web run test:ui`. Expected: 0 fail.
- [ ] Tắt container: `docker stop luong-test-pg-staff-requests` (chỉ container của phiên này).
- [ ] Ghi kết quả vào báo cáo:
  - lệnh đã chạy, số pass/fail;
  - các Ruling R-P1…R-P10;
  - những gì chưa kiểm: route `/me` mới chưa có test HTTP trên PostgreSQL thật, ngoài test PG của bảng nhắc.
