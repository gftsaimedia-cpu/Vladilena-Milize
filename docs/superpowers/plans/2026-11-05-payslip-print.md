# Phiếu lương A4: dữ liệu BE v2 và sửa "Từ chối" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bộ tính lương v2 ghi đủ dữ liệu cho tờ phiếu A4 (đầu phiếu, giờ vào/ra thật, OT từng ngày theo luật 04/11, phép năm còn lại), bấm "Từ chối" không còn 500 và lưu được lý do; kèm hợp đồng API và 5 file yêu cầu FE.

**Architecture:** Hai hàm thuần mới trong `src/modules/payroll/domain/`: `presence.ts` (giờ vào/ra theo giờ Việt Nam) và `overtime-pay.ts` (đo OT trong khung đơn, hệ số). `PayrollService.generateMonthlyPayslip` dùng hai hàm này để dựng dòng ngày. `PayrollRepository.getMonthlyData` đọc thêm ngày lễ, số ngày Phép năm đã dùng và các cột của đơn giải trình và đơn OT. `EmployeePayslip` cộng tiền OT từ các dòng. Không sửa FE.

**Tech Stack:** NestJS + TypeScript chạy bằng `tsx`, Kysely + PostgreSQL, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-05-payslip-print-design.md`

## Global Constraints

- Không sửa gì trong `web/`. Phần FE chỉ là tài liệu trong `docs/fe-yeu-cau/` (Task 5).
- Chỉ có một lược đồ: sửa thẳng `migrations/postgres/schema.sql`, không thêm file đánh số.
- Không chạy typecheck, không chạy prettier. Không đọc thư mục `spec/`.
- Giờ Việt Nam = UTC+7 cố định (không có giờ mùa hè).
- Hệ số OT: ×1,5 ngày thường, ×2 thứ Bảy và Chủ nhật, ×3 ngày có trong `company_holidays` (ngày lễ thắng cuối tuần). Ba số chỉ nằm trong `OT_MULTIPLIERS`.
- Giờ OT tính theo phút trọn, không làm tròn lên khối: phút = `Math.floor(ms giao / 60000)`, giờ = phút / 60.
- Lương giờ = `baseSalary / standardWorkdays / 8`. Với nv bậc 1 là 6.000.000 / 26 / 8 = 28.846,15…
- Test thường: `npx tsx --test test/v2/<file>.test.ts`. Test pg cần `PG_TEST_URL`; không có thì tự skip.
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Chú thích trong mã viết theo phong cách của file đang sửa.

## Review Focus

1. Ca đêm qua nửa đêm: vào 22:03, ra 06:58 hôm sau thì Vào–ra ghi "22:03–06:58". Giờ ra trong giải trình "06:30" nhỏ hơn giờ vào "22:00" thì tính sang ngày hôm sau. Test ở Task 3.
2. Đơn OT cũ không có `ot_start_time` hoặc `ot_end_time` thì bị bỏ qua, OT = 0, không ném lỗi. Test ở Task 4.
3. Có cả giờ chấm lẫn giờ trong giải trình thì giờ chấm thắng. Test ở Task 3.
4. `leave_balance` NULL thì tính là 0; `leave_balance_on` NULL thì đếm mọi ngày Phép năm đã duyệt tới hết tháng. Test ở Task 2.
5. Thứ Bảy trùng ngày lễ thì ×3, không phải ×2. Test ở Task 4.

---

### Task 1: "Từ chối" không còn 500 và lưu lý do

**Files:**
- Modify: `migrations/postgres/schema.sql:118` (CHECK của `payslips.status`)
- Modify: `src/modules/payroll/payroll.repository.ts` (`PayslipRecord`, `readPayslipRow`)
- Modify: `src/modules/payroll/payroll.service.ts` (`decidePayslip`)
- Create: `test/v2/payroll-print.pg.test.ts`
- Test: `test/v2/payroll-decision.test.ts`

**Interfaces:**
- Produces:
  - `PayslipRecord` có thêm `note: string | null; decidedBy: string | null; decidedAt: string | null`.
  - `PayrollService.decidePayslip(month, username, status, actor, note?)` lưu `note.trim()`; chuỗi rỗng hoặc toàn khoảng trắng thì lưu `null`.
  - Ruling: test pg đặt trong file mới `test/v2/payroll-print.pg.test.ts`, không nhét vào `payroll-repository.pg.test.ts` như spec §7 ghi — file cũ là một test rất dài, file mới dùng khung gọn của `day-status-repository.pg.test.ts` — rủi ro nếu sai: chỉ là chỗ đặt test, các ca pg của spec §7 vẫn đủ.
  - `test/v2/payroll-print.pg.test.ts`: một `test('Phiếu lương A4 trên PostgreSQL', …)` dựng DB tạm như `test/v2/day-status-repository.pg.test.ts` (đọc `MIGRATIONS` từ thư mục, `CREATE DATABASE`, xoá ở cuối). Seed nhân sự `pp-user` / uuid `pp-uuid-1`, `type 'nv'`, `level 1`, `contract 'long'`. Các task sau thêm seed và assert vào cùng test này.

- [ ] **Step 1: Viết test pg đỏ.** Trong `payroll-print.pg.test.ts`: seed nhân sự, một dòng `timesheet_entries` NORMAL ngày `2026-10-01`, rồi `service.generateMonthlyPayslip('pp-uuid-1', '2026-10')` và `repo.savePayrollRunAndSlips('2026-10', 'tester', [slip])`.

```ts
const rejected = await repo.decidePayslip('2026-10', 'pp-user', 'rejected', 'admin', 'Thiếu điểm KPI Quản lý');
assert.equal(rejected?.status, 'rejected');
assert.equal(rejected?.note, 'Thiếu điểm KPI Quản lý');
assert.equal(rejected?.decidedBy, 'admin');
assert.equal(typeof rejected?.decidedAt, 'string');
assert.equal((await repo.getPayslip('2026-10', 'pp-uuid-1'))?.status, 'rejected');
```

- [ ] **Step 2: Chạy và thấy đỏ** (cần container của Task 0 trong "Xác minh" bên dưới):

Run: `PG_TEST_URL=postgres://postgres@127.0.0.1:55463/postgres npx tsx --test test/v2/payroll-print.pg.test.ts`
Expected: FAIL. Lỗi `violates check constraint "payslips_status_check"`.

- [ ] **Step 3: Viết test thường đỏ** trong `payroll-decision.test.ts`:
  - `readPayslipRow` của một dòng có `note: 'x'`, `decided_by: 'admin'`, `decided_at: '2026-11-05T01:00:00.000Z'` trả đúng ba trường. Dòng có ba cột NULL trả `null`.
  - `new PayrollService(fakeRepo).decidePayslip('2026-10', 'nam', 'rejected', 'admin', '  ')` gọi repo với `note === null`. Gọi với `' Thiếu KPI '` thì repo nhận `'Thiếu KPI'`.

Run: `npx tsx --test test/v2/payroll-decision.test.ts` → FAIL.

- [ ] **Step 4: Sửa mã.**
  - CHECK thành `status IN ('draft','pending','approved','rejected','error')`.
  - `readPayslipRow` đọc `note`, `decided_by`, `decided_at` (thiếu thì `null`).
  - `decidePayslip` của service làm sạch `note` trước khi gọi repo.

- [ ] **Step 5: Chạy lại hai lệnh ở Step 2 và Step 3** → PASS. Chạy thêm `npx tsx --test test/v2/payroll-decision.test.ts test/v2/payroll.test.ts` → PASS.

- [ ] **Step 6: Commit.** `fix(payroll): allow rejected payslips and keep the decision note`

---

### Task 2: Loại, bậc, trạng thái nhân sự và phép năm còn lại

**Files:**
- Modify: `src/modules/payroll/payroll.repository.ts` (`EmployeeMonthlyRawData.staff`, `MonthRows`, `mapMonthRows`, `getMonthlyData`)
- Modify: `src/modules/payroll/domain/employee-payslip.ts` (props, class, `EmployeePayslipDTO`, `toJSON`)
- Modify: `src/modules/payroll/payroll.service.ts` (truyền trường mới; bỏ `|| 22`)
- Test: `test/v2/payroll-month-rows.test.ts`, `test/v2/payroll.test.ts`, `test/v2/payroll-print.pg.test.ts`

**Interfaces:**
- Consumes: `PayslipRecord` (Task 1).
- Produces:
  - `EmployeeMonthlyRawData.staff` có thêm `level: number`, `employmentStatus: 'probation' | 'official' | null`. Kiểu của `remainingAnnualLeaveDays` đổi thành `number | null`.
  - `MonthRows` có thêm `annualLeaveUsed?: number | string` (số dòng `day_status` đã đếm).
  - `EmployeePayslipProps` có thêm `level?: number`, `employmentStatus?: 'probation' | 'official' | null`. Kiểu của `remainingAnnualLeaveDays` đổi thành `number | null`, mặc định `null`.
  - `EmployeePayslipDTO` có thêm `employeeType: string | null`, `level: number` (mặc định 1), `employmentStatus: 'probation' | 'official' | null`. Kiểu của `remainingAnnualLeaveDays` đổi thành `number | null`.

- [ ] **Step 1: Viết test đỏ cho `mapMonthRows`.** Sửa assert cũ ở `payroll-month-rows.test.ts:116` (đang chờ 22) theo bảng dưới.
  - `level: 2` → `staff.level === 2`.
  - `contract_status`: `'official'` → `'official'`; `'probation'` → `'probation'`; NULL hoặc `'tts'` → `null`.
  - Phép năm còn lại:

| benefits có `leaveAccount` | `leave_balance` | `annualLeaveUsed` | `remainingAnnualLeaveDays` |
|---|---|---|---|
| có (`enabled: '1'`) | 12 | `'2'` | 10 |
| có | `null` | 0 | 0 |
| không, hoặc `enabled: 0` | 12 | 2 | `null` |

- [ ] **Step 2: Viết test đỏ cho truy vấn** (dùng `recordingQb` trong `payroll-month-rows.test.ts`), với `staff.leave_balance_on = '2026-10-01'` và `day_status: { first: { n: '2' } }`:

```ts
const used = calls.find(c => c.table === 'day_status');
assert.deepEqual(used?.innerJoins, [['system_requests', 'system_requests.id', 'day_status.request_id']]);
assert.deepEqual(used?.where, [
  ['day_status.employee_id', '=', 'u1'],
  ['day_status.status', '=', 'LEAVE'],
  ['system_requests.type', '=', 'LEAVE'],
  ['system_requests.leave_type', '=', 'ANNUAL'],
  ['system_requests.status', '=', 'APPROVED'],
  ['day_status.work_date', '<=', '2026-10-31'],
  ['day_status.work_date', '>=', '2026-10-01']
]);
```

  Cùng truy vấn khi `leave_balance_on` NULL thì không có dòng `'>='`.

- [ ] **Step 3: Viết test đỏ cho phiếu.** Trong `payroll.test.ts`, gọi `generateMonthlyPayslip` với `nvMonthData({ staff: { level: 2, employmentStatus: 'probation', remainingAnnualLeaveDays: 10 } })`, rồi kiểm DTO:
  - `employeeType === 'nv'`, `level === 2`, `employmentStatus === 'probation'`, `remainingAnnualLeaveDays === 10`;
  - nếu đầu vào `remainingAnnualLeaveDays: null` thì DTO cũng là `null` (không còn 22).

- [ ] **Step 4: Chạy và thấy đỏ.** `npx tsx --test test/v2/payroll-month-rows.test.ts test/v2/payroll.test.ts` → FAIL.

- [ ] **Step 5: Sửa mã.**
  - `getMonthlyData`: đếm `countAll()` từ `day_status` join `system_requests` với các điều kiện ở Step 2, cận trên là ngày cuối tháng. Truyền kết quả vào `MonthRows.annualLeaveUsed`.
  - `mapMonthRows`:
    - `level = Number(staff.level ?? 1)`;
    - `employmentStatus` chỉ nhận `'probation'` hoặc `'official'`, giá trị khác là `null`;
    - `remainingAnnualLeaveDays = có leaveAccount ? Number(leave_balance ?? 0) − Number(annualLeaveUsed ?? 0) : null`.
  - Service truyền `level`, `employmentStatus`, `remainingAnnualLeaveDays` sang `EmployeePayslip`. `toJSON` xuất ba trường mới cộng `employeeType ?? null`.

- [ ] **Step 6: Chạy lại** → PASS: `npx tsx --test test/v2/payroll-month-rows.test.ts test/v2/payroll.test.ts test/v2/payroll-persistence.test.ts`.

- [ ] **Step 7: Viết test pg** trong `payroll-print.pg.test.ts`.
  - Seed:
    - `pp-user` có `leave_balance = 12`, `leave_balance_on = '2026-10-01'`, `contract_status = 'probation'`.
    - Ba đơn `LEAVE` / `ANNUAL` đã duyệt, cùng các dòng `day_status` (status `'LEAVE'`) ngày `2026-10-20`, `2026-10-21`, `2026-11-05`.
    - Một đơn `ANNUAL` đang chờ, kèm dòng `day_status` ngày `2026-10-27`.
  - Assert:

```ts
assert.equal((await repo.getMonthlyData('pp-uuid-1', '2026-10'))?.staff.remainingAnnualLeaveDays, 10);
assert.equal((await repo.getMonthlyData('pp-uuid-1', '2026-11'))?.staff.remainingAnnualLeaveDays, 9);
assert.equal((await repo.getMonthlyData('pp-uuid-1', '2026-10'))?.staff.employmentStatus, 'probation');
```

  Chạy lệnh pg của Task 1 Step 2 → PASS.

- [ ] **Step 8: Commit.** `feat(payroll): payslip carries type, level, employment status and annual leave left`

---

### Task 3: Giờ vào/ra thật trên dòng ngày

**Files:**
- Create: `src/modules/payroll/domain/presence.ts` (xuất lại trong `domain/index.ts`)
- Modify: `src/modules/payroll/domain/employee-payslip.ts` (`DailyAttendanceLineProps`)
- Modify: `src/modules/payroll/payroll.repository.ts` (`requests` có thêm `actualCheckIn`, `actualCheckOut`)
- Modify: `src/modules/payroll/payroll.service.ts`
- Create: `test/v2/payroll-presence.test.ts`
- Test: `test/v2/payroll.test.ts`, `test/v2/payroll-month-rows.test.ts`, `test/v2/payroll-print.pg.test.ts`

**Interfaces:**
- Consumes: `EmployeeMonthlyRawData.timesheets[].actualCheckIn/actualCheckOut` (chuỗi ISO, đã có).
- Produces:

```ts
export interface Presence { checkIn: string | null; checkOut: string | null; start: Date | null; end: Date | null }
export function vnClock(at: string | Date): string;               // 'HH:MM' theo UTC+7
export function vnInstant(date: string, hhmm: string): Date;      // new Date(`${date}T${hhmm}:00+07:00`)
export function presenceOf(
  workDate: string,
  punchIn: string | null | undefined,
  punchOut: string | null | undefined,
  explained?: { checkIn?: string | null; checkOut?: string | null }
): Presence;
export function inOutText(p: Presence): string;                   // `${checkIn ?? '—'}–${checkOut ?? '—'}`
```

  - `DailyAttendanceLineProps` có thêm `checkIn?: string | null; checkOut?: string | null`.
  - `EmployeeMonthlyRawData.requests[]` có thêm `actualCheckIn?: string | null; actualCheckOut?: string | null` (cắt về `'HH:MM'`).
- Quy tắc của `presenceOf`:
  - giờ chấm thắng; bên nào thiếu thì lấy giờ giải trình, qua `vnInstant(workDate, hhmm)`;
  - nếu `end ≤ start` và `end` lấy từ giải trình thì cộng 1 ngày;
  - `checkIn` và `checkOut` là `vnClock` của `start` và `end`.

- [ ] **Step 1: Viết test đỏ** `test/v2/payroll-presence.test.ts`:

| Đầu vào (workDate, punchIn, punchOut, explained) | Kỳ vọng |
|---|---|
| `'2026-10-07'`, `'2026-10-07T01:12:00.000Z'`, `'2026-10-07T10:05:00.000Z'` | `inOutText` = `'08:12–17:05'` |
| như trên, punchOut `null` | `'08:12–—'`, `end === null` |
| punchOut `null`, explained `{ checkOut: '19:20' }` | `checkOut '19:20'`, `end.toISOString() === '2026-10-07T12:20:00.000Z'` |
| punchOut `'2026-10-07T10:05:00.000Z'`, explained `{ checkOut: '19:20' }` | `checkOut '17:05'` (giờ chấm thắng) |
| `'2026-10-05'`, `'2026-10-05T15:03:00.000Z'`, `'2026-10-05T23:58:00.000Z'` | `'22:03–06:58'` |
| `'2026-10-05'`, `null`, `null`, `{ checkIn: '22:00', checkOut: '06:30' }` | `end.toISOString() === '2026-10-05T23:30:00.000Z'` |

  Trong `payroll.test.ts`: dòng NORMAL ngày 07/10 có giờ chấm như dòng 1 thì `dailyLines` của ngày đó có `checkIn '08:12'`, `checkOut '17:05'`, `inOutText '08:12–17:05'`. Dòng LEAVE vẫn là `'Hưởng lương ngày'`, `checkIn` là `null`. Đơn `EXPLANATION` đã duyệt có `explanationDate '2026-10-07'`, `actualCheckOut '19:20'` lấp vào giờ ra đang thiếu.

  Trong `payroll-month-rows.test.ts`: đơn có `actual_check_in: '08:00:00'`, `actual_check_out: '19:20'` map thành `'08:00'` và `'19:20'`.

- [ ] **Step 2: Chạy và thấy đỏ.** `npx tsx --test test/v2/payroll-presence.test.ts test/v2/payroll.test.ts test/v2/payroll-month-rows.test.ts` → FAIL.

- [ ] **Step 3: Viết mã.**
  - Viết `presence.ts`.
  - `mapMonthRows` map hai cột giải trình.
  - Service dựng `Map<explanationDate, {checkIn, checkOut}>` từ các đơn `EXPLANATION` đã duyệt.
  - Mỗi dòng NORMAL, FLEX, NIGHT gọi `presenceOf`, rồi gán `checkIn`, `checkOut` và `inOutText = inOutText(p)`.
  - Dòng LEAVE, ISAT, UNPAID giữ chữ cũ, `checkIn` và `checkOut` là `null`.
  - Bỏ hai chuỗi ghi cứng `'08:00–17:00'` và `'22:00–06:00'`.

- [ ] **Step 4: Chạy lại lệnh Step 2** → PASS. Chạy thêm `test/v2/payroll-persistence.test.ts` → PASS.

- [ ] **Step 5: Viết test pg.** Seed thêm vào `payroll-print.pg.test.ts`:
  - `timesheet_entries` ngày `2026-10-07`, `actual_check_in = '2026-10-07 08:12:00+07'`, `actual_check_out` NULL;
  - đơn `EXPLANATION` đã duyệt, `explanation_date '2026-10-07'`, `actual_check_out '19:20'`.

  Assert: dòng 07/10 của `generateMonthlyPayslip('pp-uuid-1','2026-10').dailyLines` có `checkIn '08:12'` và `checkOut '19:20'`. Chạy lệnh pg → PASS.

- [ ] **Step 6: Commit.** `feat(payroll): day lines show real check-in and check-out times`

---

### Task 4: OT theo luật 04/11, tính từng ngày

**Files:**
- Create: `src/modules/payroll/domain/overtime-pay.ts` (xuất lại trong `domain/index.ts`)
- Modify: `src/modules/payroll/domain/employee-payslip.ts` (`otPayTotal`)
- Modify: `src/modules/payroll/payroll.repository.ts`:
  - `EmployeeMonthlyRawData` có thêm `holidayDates?: string[]`;
  - `requests[]` có thêm `otStartTime`, `otEndTime`;
  - `MonthRows.holidays?: Array<string | Date>`;
  - truy vấn `company_holidays`.
- Modify: `src/modules/payroll/payroll.service.ts`
- Modify: `test/v2/payroll-fixtures.ts`
- Create: `test/v2/payroll-overtime.test.ts`
- Test: `test/v2/payroll.test.ts`, `test/v2/payroll-month-rows.test.ts`, `test/v2/payroll-print.pg.test.ts`

**Interfaces:**
- Consumes: `vnInstant`, `Presence` (Task 3).
- Produces:

```ts
export const OT_MULTIPLIERS = { weekday: 1.5, weekend: 2, holiday: 3 } as const;
export type OtMultiplier = 1.5 | 2 | 3;
export interface OtWindow { date: string; start: string; end: string }          // 'YYYY-MM-DD', 'HH:MM', 'HH:MM'
export interface PresenceSpan { workDate: string; start: Date; end: Date }
export interface OtShare { lineDate: string; otDate: string; hours: number; multiplier: OtMultiplier }
export function otMultiplierOf(date: string, holidays: ReadonlySet<string>): OtMultiplier;
export function measureOvertime(windows: OtWindow[], spans: PresenceSpan[], holidays: ReadonlySet<string>): OtShare[];
export function otPayOf(hours: number, hourRate: number, multiplier: OtMultiplier): number; // Math.round(h × rate × m)
```

- Cách đo trong `measureOvertime`, cho mỗi khung:
  1. `[vnInstant(date,start), vnInstant(date,end))` giao với từng span. Phút = `Math.floor(tổng ms giao / 60000)`. Phút = 0 thì bỏ khung.
  2. `lineDate` = `date` nếu có span `workDate === date`; nếu không thì là `workDate` của span đầu tiên có giao.
  3. `hours = phút / 60`.
- `EmployeePayslip.otPayTotal = Σ dailyLines[].otPay`. `ot15Hours`, `ot20Hours`, `ot30Hours` vẫn lấy từ `otHoursByRate`, và vẫn dùng cho phần miễn thuế.

- [ ] **Step 1: Sửa fixture trước, giữ nguyên mọi số đang được assert.** Trong `payroll-fixtures.ts`:
  - đơn `req_ot_1` thành `{ otDate: '2026-10-03', otStartTime: '18:00', otEndTime: '20:00', otHours: 2 }`;
  - dòng NORMAL ngày `2026-10-03` (thứ Bảy) có `actualCheckIn '2026-10-03T01:00:00.000Z'` và `actualCheckOut '2026-10-03T13:00:00.000Z'`.

  Theo luật mới: 2 giờ × ×2 = 115.385, đúng bằng số cũ. Vì vậy `otPayTotal 115_385`, `grossIncome 11_007_693` và `taxExemptIncome 57_692` của `payroll.test.ts` và `payroll-persistence.test.ts` không đổi.

- [ ] **Step 2: Viết test đỏ** `test/v2/payroll-overtime.test.ts`. Ca 08–17; khung 18:00–20:00; lương giờ = 6.000.000/26/8.

| Ngày (`ot_date`) | Ngày lễ | Giờ ra (UTC+7) | `hours` | `multiplier` | `otPayOf` |
|---|---|---|---|---|---|
| 2026-10-07 (thứ Tư) | – | 19:20 | 80/60 | 1.5 | 57_692 |
| 2026-10-07 | – | 20:30 | 2 | 1.5 | 86_538 |
| 2026-10-10 (thứ Bảy) | – | 20:30 | 2 | 2 | 115_385 |
| 2026-10-10 | `{'2026-10-10'}` | 20:30 | 2 | 3 | 173_077 |
| 2026-10-07 | – | 17:30 | – | – | không có share |

  Thêm các ca:
  - hai khung cùng ngày 06:00–07:00 và 18:00–19:00, có mặt 06:00–19:00 → hai share, tổng 2 giờ, cùng `lineDate '2026-10-07'`;
  - khung ngày `2026-10-06` không có span ngày đó, nhưng span của ngày `2026-10-05` (ca đêm) giao với khung → `lineDate '2026-10-05'`;
  - không span nào giao → `[]`.

- [ ] **Step 3: Viết test đỏ cho phiếu** trong `payroll.test.ts`, dùng `nvMonthData` và thay đơn OT cùng dòng 07/10:
  - giờ ra 19:20:
    - dòng 07/10 có `otPay 57_692` và `dailyTotal = daySalary + 57_692`;
    - phiếu có `otPayTotal 57_692` và `ot15Hours ≈ 80/60`, kiểm bằng `assert.ok(Math.abs(x - 4/3) < 1e-9)`.
  - thiếu giờ ra, có `EXPLANATION` đã duyệt ghi `'19:20'` → 57_692.
  - thiếu giờ ra, không có giải trình → `otPay 0` và `otPayTotal 0`.
  - đơn OT thiếu `otStartTime` → OT 0, không ném lỗi.
  - OT ngày 07/10 với 57_692, thêm OT thứ Bảy 10/10 với 115_385 → `otPayTotal 173_077`, bằng tổng `otPay` các dòng.
  - đơn OT ngày không có dòng công → số dòng `dailyLines` không đổi, `otPayTotal 0`.

  Trong `payroll-month-rows.test.ts`:
  - truy vấn `company_holidays` có `where [['holiday_date','>=','2026-10-01'],['holiday_date','<=','2026-10-31']]`;
  - `holidays: [new Date(2026, 8, 2)]` map thành `['2026-09-02']`;
  - đơn có `ot_start_time '18:00:00'` map thành `otStartTime '18:00'`.

- [ ] **Step 4: Chạy và thấy đỏ.** `npx tsx --test test/v2/payroll-overtime.test.ts test/v2/payroll.test.ts test/v2/payroll-month-rows.test.ts` → FAIL. Riêng Step 1 phải chưa làm đỏ test cũ nào; nếu đỏ là fixture sai.

- [ ] **Step 5: Viết mã.**
  - Viết `overtime-pay.ts`. Repository đọc ngày lễ và map hai cột giờ OT.
  - Trong service:
    1. dựng presence cho mọi dòng (Task 3), rồi tạo span cho dòng có cả `start` lẫn `end`;
    2. khung OT = các đơn OVERTIME đã duyệt có đủ `otDate`, `otStartTime`, `otEndTime`;
    3. `shares = measureOvertime(...)`;
    4. mỗi dòng: `otHours = Σ hours`, `otPay = Σ otPayOf(...)`, rồi `dailyTotal += otPay`;
    5. `otHoursByRate = { x15, x20, x30 }` cộng theo `multiplier`.
  - Bỏ vòng cộng `req.otHours` cũ. Bỏ đọc `ts.otHours` cho dòng.
  - `EmployeePayslip.otPayTotal` cộng từ `dailyLines`.

- [ ] **Step 6: Chạy lại** → PASS: `npx tsx --test test/v2/payroll*.test.ts`.

- [ ] **Step 7: Viết test pg** trong `payroll-print.pg.test.ts`:
  - Seed:
    - `INSERT INTO company_holidays (holiday_date, name) VALUES ('2026-10-10', 'Lễ thử')`;
    - dòng công thứ Bảy 10/10, vào `08:00+07`, ra `20:30+07`;
    - đơn OVERTIME đã duyệt ngày 10/10, khung `'18:00'`–`'20:00'`.
  - Assert: dòng 10/10 có `otPay === 173_077` và `slip.ot30Hours === 2`.
  - Chạy lệnh pg → PASS.

- [ ] **Step 8: Commit.** `feat(payroll): pay overtime per day from the approved window and real presence`

---

### Task 5: Hợp đồng API và 5 file yêu cầu FE

**Files:**
- Modify: `docs/api/v2-contract.md` (mục `GET /api/v2/payroll/:month/:employeeId`; thêm mục `POST /api/v2/payroll/:month/:username/decision`)
- Create (trong `docs/fe-yeu-cau/`):
  - `in-phieu-luong-a4--noi-api-v2.md`
  - `phieu-luong-ngan-keo--nut-in.md`
  - `phieu-luong-ngan-keo--tu-choi-ly-do.md`
  - `phieu-luong-ngan-keo--loai-bac-trang-thai.md`
  - `bang-luong--in-tat-ca.md`

**Interfaces:**
- Consumes: tên trường cuối cùng của Task 1–4: `note`, `decidedBy`, `decidedAt`, `employeeType`, `level`, `employmentStatus`, `remainingAnnualLeaveDays`, `dailyLines[].checkIn/checkOut/inOutText/otHours/otPay/shiftLabel`, `ot15Hours/ot20Hours/ot30Hours/otPayTotal`.

- [ ] **Step 1: Hợp đồng API.**
  - Bảng "Các trường mới và đổi nghĩa trong `details`" thêm các trường trên, cách tính OT (§4.4 của spec) và phép còn lại (§4.5).
  - Bản ghi phiếu thêm `note`, `decidedBy`, `decidedAt`; `status` có thêm `rejected`.
  - Thêm mục `decision`:
    - body `{ decision: 'approve' | 'reject', note?: string }`;
    - `200 { month, payslip }`;
    - `400 INVALID_MONTH`, `400 INVALID_DECISION`, `404 PAYSLIP_NOT_FOUND`, `409 PAYROLL_FINALIZED`;
    - quyền `payroll.approve`.

- [ ] **Step 2: Năm file yêu cầu FE.** Nội dung theo §6 của spec. Mỗi file có bốn mục ngắn:
  1. "Người dùng đã chốt", ghi kèm ngày 2026-11-05;
  2. "Dữ liệu BE" (trường, ví dụ JSON nhỏ);
  3. "Mã cần đổi / xoá" (đường dẫn file FE và dòng hiện tại);
  4. "Cách kiểm" (hành vi thấy được, test UI nên có).

  Các điểm bắt buộc ghi:
  - Nút In mở tab mới `?in=1`, in mọi trạng thái.
  - "In tất cả" chỉ in phiếu đã duyệt, bị khoá khi bằng 0.
  - Lý do từ chối không bắt buộc.
  - Ô Tình trạng ghi Nháp / Đã duyệt / Bị từ chối.
  - Phiếu tính trước khi sửa thiếu trường mới, hiện "—".
  - `remainingAnnualLeaveDays` có thể là `null`. FE hiện tại sẽ ghi "null ngày" cho tts trên BE thật cho tới khi sửa.
  - Danh sách mã v1 chết cần xoá.

  Không bàn bảo mật, không dán giá trị bí mật.

- [ ] **Step 3: Rà chéo.** Mọi tên trường trong 6 file trên phải khớp `EmployeePayslipDTO` và `PayslipRecord` thật: `grep -n "employmentStatus\|decidedAt\|checkOut" src/modules/payroll -r` có kết quả cho từng trường.

- [ ] **Step 4: Commit.** `docs: payslip API fields and FE requests for the A4 print`

---

## Xác minh (sau Task 5, chạy trong lượt)

- Task 0 (dựng một lần trước Task 1): `docker run -d --rm --name luong-test-pg-payslip-print -p 127.0.0.1:55463:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16`
- `PG_TEST_URL=postgres://postgres@127.0.0.1:55463/postgres npm test` → không test nào fail. Test pg của file mới chạy, không bị skip.
- `PW_PORT=4253 npm --prefix web run test:ui` → xanh như nền (FE không đổi).
- `git diff --stat f9e5a32 -- web` → rỗng.
- `docker stop luong-test-pg-payslip-print`.
