# Tái cấu trúc quanh "Ngày": các class, kiểu dữ liệu và cách chúng nối nhau

Trạng thái: **nháp để chủ dự án đọc, chưa duyệt, chưa sửa dòng code nào.** Tài liệu này chỉ thiết kế kiểu dữ liệu và class; hành vi nghiệp vụ giữ nguyên như code hiện tại. Thay bản nháp trước (bản đó nhét quá nhiều việc vào `Day`).

## 1. Nguyên tắc

1. **`Day` chỉ trả lời hai câu: ngày này là ngày gì, và đã diễn ra chưa.** Gần như chỉ là `kind`, `phase` và vài cờ suy ra. Công, tiền, nhãn hiển thị, thao tác được phép nằm ở nơi dùng.
2. **`Day` không biết `Request`, `Punch`, `Payslip`.** Nó chỉ biết **`Claim`**: dữ liệu mô tả "một đơn đã làm gì lên ngày này". Đơn của nhân viên nối vào ngày qua `Claim`, không qua class đơn.
3. **Phụ thuộc một chiều:** `Facts → Claim → Day/Month → Attendance → Pay → Payroll/Views`. `Request` và `Planner` đọc `Month` để kiểm hợp lệ, nhưng `Day` không đọc ngược lại.
4. **Hàm thuần ở lõi, service mỏng ở rìa.** Lõi nhận dữ liệu và `now`, trả giá trị; service chỉ nạp dữ liệu, gọi lõi, lưu và phát sự kiện.
5. **Một sự thật, một nơi lưu.** Mỗi thứ chỉ có một nguồn; thứ còn lại là suy ra.

## 2. Hiện trạng (đã đọc code)

| Vấn đề | Bằng chứng |
|---|---|
| Cùng sự thật nằm ở 3 nơi lưu | `requests` (+ khung bù, mã giải trình), `day_status` (ai giữ ngày nào), `work_schedules` (lịch ngày: `REGULAR / SHIFT_CHANGE / MAKE_UP / OVERTIME / ISAT`, `PLANNED / COMPLETED / ON_LEAVE / CANCELLED`) |
| 3 "lịch" song song, mỗi cái tự biết "có phải ngày làm không" | `EmployeeDays` (requests), `buildAttendanceDay` (attendance), `daySummaryOf` + `weekOf` (me), thêm `workdayOf` |
| `SystemRequest` (795 dòng) là một class cho 8 loại đơn | Một bảng props với nhiều trường tuỳ chọn theo loại (`leave*`, `ot*`, `advance*`, `explanation*`, `makeupSlots`...) và 8 hàm tạo tĩnh |
| `RequestsService` 1956 dòng, 55 phương thức | Duyệt, huỷ, lọc ngày, ghi lịch, đánh dấu ngày (`markLeaveDays`, `markShiftChangeDays`, `dropHolidayDays`, `releaseDays`, `rewriteDays`...) trộn với dựng form |
| `attendance-day.ts` (451 dòng) làm ba việc một lúc | Phân loại ngày + chấm kết quả (đủ/vắng/gắn cờ) + quyết công và tiền |
| 5 bộ trạng thái | 11 (`AttendanceDayStatus`), 5 cột cũ (`DayStatus`, `CheckInStatus`, `CheckOutStatus`), 9 (`DayKind` của nhân viên), 8 (`CellKind` của Admin), cờ riêng ở `filing-choices` |
| Lớp cũ chồng lớp mới | `DailyTimesheet` (450 dòng) song song với bảng `attendance_days` (cần xác minh còn dùng ở đâu trước khi gỡ) |

## 3. Bản đồ khối

```
 Facts            Claim            Day / Month          Attendance           Pay
 (dữ kiện gốc) →  (đơn đè lên  →   (ngày là gì,     →   (đi làm thế nào:  →  (công và tiền
                   ngày)            đã diễn ra chưa)     chấm công, giải      của ngày)
                                                         trình, kết quả)
   ▲                 ▲                  ▲                      ▲
   │                 │                  │                      │
 Settings        Request + Planner   Calendar service      Punch / Explanation
 Employee        (đơn nộp, duyệt)    (nạp + dựng Month)    (sự kiện chấm công)

 Period (khoá kỳ) chặn thao tác ở cả Request, Attendance, Payroll; không đổi kind của ngày.
 DomainEvent: mọi thay đổi phát một sự kiện, Recalculator suy ra ngày bị ảnh hưởng.
```

## 4. Kiểu dữ liệu

Chỉ khai báo, không có thân hàm. Chữ `readonly` nghĩa là bất biến.

### 4.1 Dữ kiện gốc (Facts)

```ts
type IsoDate = string;      // 'YYYY-MM-DD', giờ Việt Nam
type Clock = string;        // 'HH:mm'
type Dow = 1 | 2 | 3 | 4 | 5 | 6;   // T2..T7 (Chủ nhật không bao giờ là ngày làm)

interface Employment { startDate: IsoDate | null; resignedOn: IsoDate | null }
interface WeekPlan   { workdays: ReadonlySet<Dow>; standardWorkdays: number }
interface Benefits   { paidLeave: boolean; paidHoliday: boolean; isat: boolean }
interface ShiftPlan  { type: 'NORMAL' | 'FLEX' | 'NIGHT'; start: Clock; end: Clock; allowancePct: number }
interface Holiday    { date: IsoDate; name: string }

type PeriodState = 'open' | 'attendance_locked' | 'calculated' | 'approved' | 'paid';

/** Mọi thứ cần để dựng các ngày của một người trong một tháng. */
interface CalendarFacts {
  employeeId: string;
  month: string;                 // 'YYYY-MM'
  employment: Employment;
  week: WeekPlan;                // đã gồm tuần làm riêng của người đó, theo tháng
  benefits: Benefits;
  defaultShift: ShiftPlan;       // ca mặc định của hồ sơ
  holidays: readonly Holiday[];
  claims: readonly Claim[];      // đơn đang chờ và đã duyệt (xem 4.2)
}
```

### 4.2 Claim: chỗ nối với đơn của nhân viên

```ts
type ClaimKind =
  | 'LEAVE'            // nghỉ (leaveType quyết có lương hay không)
  | 'LEAVE_MAKEUP'     // nghỉ có làm bù
  | 'ISAT'             // thứ Bảy iSAT
  | 'HALF_SHIFT'       // nghỉ giữa ca (làm một nửa)
  | 'SHIFT_CHANGE'     // đổi ca
  | 'OT_WINDOW'        // khung làm thêm
  | 'MAKEUP_WINDOW';   // khung làm bù

type ClaimStatus = 'PENDING' | 'APPROVED';   // đơn bị từ chối hoặc huỷ không còn Claim nào

interface Claim {
  readonly requestId: string;
  readonly date: IsoDate;
  readonly kind: ClaimKind;
  readonly status: ClaimStatus;
  readonly detail: ClaimDetail;            // phần riêng theo kind
  readonly replaces: string | null;        // requestId đổi ca bị đơn này thay đúng ngày này
}

type ClaimDetail =
  | { kind: 'LEAVE'; leaveType: LeaveType }
  | { kind: 'LEAVE_MAKEUP'; owedMinutes: number }
  | { kind: 'ISAT' }
  | { kind: 'HALF_SHIFT'; half: 'FIRST' | 'SECOND'; start: Clock; end: Clock }
  | { kind: 'SHIFT_CHANGE'; shift: ShiftPlan }
  | { kind: 'OT_WINDOW' | 'MAKEUP_WINDOW'; start: Clock; end: Clock };
```

Một `Claim` thay cho ba thứ đang ghi song song khi duyệt đơn: dòng `day_status`, dòng `work_schedules` và các khung OT/bù. Giải trình **không** là `Claim`, vì nó không đổi kế hoạch của ngày mà bổ sung cho kết quả chấm công (4.4).

### 4.3 Day và Month

```ts
type DayKind =
  | 'WORK'          // ngày làm
  | 'EXTRA'         // ngoài tuần làm nhưng có khung OT/bù
  | 'LEAVE_PAID' | 'LEAVE_UNPAID' | 'LEAVE_MAKEUP'
  | 'ISAT'
  | 'HOLIDAY'
  | 'REST'          // nghỉ theo tuần làm, không có khung nào
  | 'OUTSIDE';      // trước ngày vào làm hoặc sau ngày nghỉ việc

type Phase = 'UPCOMING' | 'IN_PROGRESS' | 'DONE';   // sắp / đang / đã diễn ra

interface TimeSpan { start: Date; end: Date }        // ca đêm: end sang ngày kế

class Day {
  readonly date: IsoDate;
  readonly kind: DayKind;                // chỉ do Claim đã duyệt, lịch và dữ kiện quyết
  readonly phase: Phase;
  readonly shift: ShiftPlan | null;      // ca của ngày (đã tính đổi ca đã duyệt); null nếu không phải ngày làm
  readonly half: 'FIRST' | 'SECOND' | null;
  readonly windows: readonly { kind: 'OT' | 'MAKEUP'; start: Clock; end: Clock }[];  // khung đã duyệt
  readonly span: TimeSpan | null;        // khoảng giờ của ca/khung, để tính phase
  readonly claims: readonly Claim[];     // MỌI claim của ngày, kể cả đang chờ duyệt

  // Cờ suy ra từ kind/phase, không lưu
  get isWork(): boolean;        get isOff(): boolean;      get isLeave(): boolean;
  get isHoliday(): boolean;     get isOutside(): boolean;
  get hasStarted(): boolean;    get isOver(): boolean;
  get pending(): readonly Claim[];       // claim chờ duyệt (đơn chờ nằm ở đây, kind chưa đổi)

  at(now: Date): Day;                    // đổi phase theo giờ, không dựng lại dữ kiện
  claimOf(kind: ClaimKind): Claim | null;
}

class Month {
  static of(facts: CalendarFacts, now: Date): Month;   // 28-31 ngày một lượt
  readonly days: readonly Day[];
  day(date: IsoDate): Day;
  between(from: IsoDate, to: IsoDate): readonly Day[];
  at(now: Date): Month;
}
```

**Thứ tự quyết `kind`** (đúng thứ tự trong `buildAttendanceDay` hiện tại, đây là nơi duy nhất giữ nó): `OUTSIDE` → `HOLIDAY` (trên ngày làm) → claim `LEAVE`/`LEAVE_MAKEUP`/`ISAT` đã duyệt → ngày không thuộc tuần làm (`REST`, hoặc `EXTRA` nếu có khung) → `WORK`.

**Đơn chờ duyệt không đổi `kind`**; chúng hiện ở `day.pending`. Đơn được duyệt thì `Claim.status` thành `APPROVED`, `Month` dựng lại và `kind` mới tự ra. Đổi ca đã duyệt đổi `shift`, không đổi `kind`. Khung OT/bù đã duyệt vào `windows`. Nửa ca đã duyệt đặt `half`.

**`phase`**: ngày `WORK`/`EXTRA` theo `span` (trước giờ vào ca → `UPCOMING`, trong ca → `IN_PROGRESS`, hết ca → `DONE`); ngày còn lại theo ngày (tương lai/hôm nay/quá khứ). Mốc 30 phút chờ đánh giá là của chấm công (4.4), không phải của `Day`.

### 4.4 Chấm công: ngày đi làm thế nào

```ts
class Punches {
  static of(events: readonly PunchEvent[], day: Day): Punches;   // gom theo ngày công, kể cả ca đêm
  readonly first: Date | null;       // lần vào đầu
  readonly last: Date | null;        // lần ra cuối
  readonly presence: 'NOT_IN' | 'IN' | 'OUT';
}

interface DayExplanation {
  requestId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  cases: readonly ExplanationCase[];
  claimedIn: Clock | null;
  claimedOut: Clock | null;
}

type Outcome =
  | 'NONE'      // chưa đánh giá
  | 'FULL'      // đủ, không mã nào ảnh hưởng tiền
  | 'FLAGGED'   // có chấm công, có mã ảnh hưởng tiền, chưa có giải trình được duyệt
  | 'EXCUSED'   // có mã ảnh hưởng tiền, giải trình đã duyệt
  | 'ABSENT';   // không chấm công và không có giải trình duyệt

interface DayResult {
  date: IsoDate;
  outcome: Outcome;
  cases: readonly DetectedCase[];
  lateMinutes: number;  earlyMinutes: number;
  workHours: number;
  makeup: { minutes: number; credit: number };
  deductionMinutes: number;
  explanation: DayExplanation | null;
}

/** Hàm thuần. Mốc 30 phút nằm trong rules. */
function evaluate(day: Day, punches: Punches, explanation: DayExplanation | null, rules: AttendanceRules): DayResult;
```

`evaluate` là phần "đánh giá" tách ra từ `buildAttendanceDay`; phần phân loại đã chuyển sang `Month`.

### 4.5 Công và tiền

```ts
interface DayPay {
  units: 0 | 0.5 | 1;
  deductionMinutes: number;
  countsAsWorkday: boolean;
  countsAsDayOff: boolean;
  paysDay: boolean;              // ngày có lương (bảo hiểm tính theo số này)
}

/** Bảng phán quyết: tra theo (day.kind, result.outcome, day.half, benefits). Thiếu tổ hợp thì không biên dịch. */
function payOf(day: Day, result: DayResult, benefits: Benefits): DayPay;

class MonthTimesheet {
  readonly month: Month;
  readonly results: ReadonlyMap<IsoDate, DayResult>;
  pay(date: IsoDate): DayPay;
  summary(): { workDays: number; paidDays: number; leaveDays: number; absent: number; flagged: number; pending: number };
}
```

### 4.6 Đơn: một loại đơn một class, cùng một giao diện

Thay `SystemRequest` (một class, nhiều trường tuỳ chọn):

```ts
abstract class Request {
  readonly id: string;  readonly employeeId: string;  readonly reason: string;
  readonly status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  readonly review: { by: string; at: Date; note: string | null } | null;
  abstract readonly type: RequestType;

  abstract footprint(): readonly Claim[];     // đơn này đè lên những ngày nào, kiểu gì (rỗng nếu REJECTED/CANCELLED)
  approve(by: string, note?: string): Request;
  reject(by: string, note?: string): Request;
  cancel(by: string, reason?: string): Request;
}

class LeaveRequest            extends Request { leaveType; start; end; days }
class LeaveWithMakeupRequest  extends Request { start; end; owedMinutes; slots: MakeupSlot[] }
class HalfShiftLeaveRequest   extends Request { date; half }
class OvertimeRequest         extends Request { date; start; end; hours }
class ShiftChangeRequest      extends Request { start; end; frame }
class IsatRequest             extends Request { date; registration }
class ExplanationRequest      extends Request { date; cases; claimedIn; claimedOut }   // footprint rỗng; thành DayExplanation
class AdvanceRequest          extends Request { amount; month }                         // không đè ngày nào
```

`footprint()` thay cho `requestDates`, `markLeaveDays`, `markShiftChangeDays`, `markIsatDay`, `dropHolidayDays`, `releaseDays`: đơn tự nói nó đè gì, không còn `if (type === ...)` rải trong service.

### 4.7 Lập kế hoạch và kiểm hợp lệ

```ts
type Action = 'FILE_LEAVE' | 'FILE_SHIFT_CHANGE' | 'FILE_OVERTIME' | 'FILE_ISAT' | 'EXPLAIN' | 'PUNCH_IN' | 'PUNCH_OUT';
interface Verdict { allowed: boolean; reason: string | null }       // reason là câu BE soạn sẵn

class ClaimPlanner {
  /** Đơn mới đè lên Month hiện có thì được không, những ngày nào, xung đột gì. */
  plan(request: Request, month: Month): ClaimPlan | Conflict;
}

class DayPolicy {                                         // thay các cờ leaveCounted, shiftChangeable, workdayOf, punches/check
  can(action: Action, day: Day, ctx: { period: PeriodState; punches?: Punches; today: IsoDate }): Verdict;
}
```

### 4.8 Kỳ lương và sự kiện

```ts
class Period {                                            // gom PeriodGate + trạng thái
  readonly month: string;  readonly state: PeriodState;
  allows(use: 'file' | 'review' | 'punch' | 'recalculate' | 'calculate'): Verdict;
}

type DomainEvent =
  | { type: 'PunchRecorded'; employeeId: string; workDate: IsoDate }
  | { type: 'ClaimsChanged'; employeeId: string; dates: readonly IsoDate[]; requestId: string }
  | { type: 'FactsChanged'; employeeId: string | 'ALL'; fromMonth: string }    // đổi tuần làm, ca, ngày lễ, quyền lợi
  | { type: 'PeriodChanged'; month: string; state: PeriodState }
  | { type: 'DayPhaseDue'; employeeId: string; date: IsoDate };                 // giờ trôi qua mốc đổi phase

class Recalculator {
  /** Sự kiện → các ngày bị ảnh hưởng → dựng lại Month, evaluate lại → lưu → phát RealtimeBus. */
  on(event: DomainEvent): Promise<void>;
}
```

## 5. Tương tác

Sơ đồ ai gọi ai (mũi tên là "biết đến"):

```
RequestService ──► Request(.footprint) ──► Claim
      │                                       ▲
      ├──► ClaimPlanner ──► Month ◄── CalendarService ──► Facts (Settings, Employee, Holiday)
      ├──► DayPolicy ──► Day, Period
      └──► ClaimRepo, Period ──► emit ClaimsChanged

AttendanceService ──► DayPolicy(PUNCH_*) ──► Month.day
      └──► PunchRepo ──► emit PunchRecorded

Recalculator ◄── mọi DomainEvent
      └──► CalendarService.month ─► evaluate(Day, Punches, DayExplanation) ─► payOf ─► TimesheetRepo ─► emit DayChanged (Realtime)

PayrollService ──► MonthTimesheet ──► payOf ──► Payslip         (insurance dùng pay.paysDay)
Views (Admin, nhân viên) ──► Month + MonthTimesheet ──► Cell/DayDTO (hàm trình bày thuần)
```

### 5.1 Nhân viên nộp đơn nghỉ
1. `RequestService.file` dựng `LeaveRequest`, nạp `Month` (qua `CalendarService`), hỏi `DayPolicy.can(FILE_LEAVE, day, ctx)` từng ngày và `Period.allows('file')`.
2. `ClaimPlanner.plan(request, month)` kiểm xung đột với `day.claims` (ngày lễ bị bỏ, ngày đã có đơn thì báo `DayConflict`).
3. Lưu đơn và `footprint()` với `status: PENDING`, phát `ClaimsChanged`.
4. `Recalculator` dựng lại các ngày đó: `day.pending` có một claim chờ, `kind` vẫn `WORK`. Admin thấy "đơn chờ", FE nhận qua SSE.

### 5.2 Admin duyệt
1. `request.approve()` đổi trạng thái; `footprint()` giờ trả claim `APPROVED`.
2. Lưu, phát `ClaimsChanged`. `Recalculator` dựng lại `Month`: `kind` thành `LEAVE_PAID`/`LEAVE_UNPAID`/`LEAVE_MAKEUP`/`ISAT`, hoặc `shift`/`half`/`windows` đổi.
3. `evaluate` + `payOf` chạy lại cho các ngày đó; phiếu lương đã tính của kỳ `calculated` được đưa về nháp (luật hiện tại).

### 5.3 Nhân viên chấm công
1. `DayPolicy.can(PUNCH_IN, day, ctx)`: cần `day.isWork` hoặc `EXTRA` và kỳ còn mở. Câu lý do là câu trả về cho nút bị khoá.
2. Lưu `PunchEvent`, phát `PunchRecorded`. `Recalculator` chỉ `evaluate` lại **ngày đó**; `Month` không dựng lại vì `Day` không phụ thuộc chấm công.

### 5.4 Giờ trôi qua
`DayPhaseDue` (hoặc tính khi đọc bằng `month.at(now)`) đổi `phase`. Qua giờ hết ca + 30 phút thì `evaluate` ra `ABSENT` hay `FULL`/`FLAGGED`.

### 5.5 Đổi cài đặt (tuần làm, ca, ngày lễ)
`FactsChanged { fromMonth }` → dựng lại `Month` các tháng bị ảnh hưởng → `evaluate` lại. Thay cho `AttendanceSettingsListener` hiện tại (đã tối ưu bằng `refreshMany`).

## 6. Bản đồ chuyển: class cũ → mới

| Cũ | Mới | Ghi chú |
|---|---|---|
| `EmployeeDays` (requests), phần phân loại của `buildAttendanceDay`, `daySummaryOf`/`weekOf`, `workdayOf`, `baseKindOf` | `Month` / `Day` | Một lịch duy nhất |
| `day_status` + `work_schedules` (phần đơn ghi) + khung OT/bù | `Claim` | Xem câu hỏi mở 1 |
| `SystemRequest` | `Request` + 8 lớp con | `footprint()` thay `requestDates` và các hàm mark/drop/release |
| Phần đánh giá của `buildAttendanceDay`, `explanation-detect` | `evaluate`, `DayResult`, `Punches` | Giữ thuật toán, đổi vỏ |
| Phần quyết công của `buildAttendanceDay`, đoạn đếm ngày có lương trong `payroll.service` | `payOf`, `DayPay` | |
| `filing-choices` (cờ ngày), kiểm khoá nút ở `me.controller`, `punchCheck` | `DayPolicy.can` | |
| `PeriodGate` | `Period` (+ `PeriodGate` còn là bộ nạp) | |
| `AttendanceSettingsListener`, `AttendanceDaysService.refresh*`, `SettingsChanges` | `Recalculator` + `DomainEvent` | |
| 5 bộ trạng thái và 3 cột cũ (`dayStatus`, `checkInStatus`, `checkOutStatus`) | `DayKind`, `Phase`, `Outcome` | Bỏ cột cũ khi không còn nơi đọc |
| `DailyTimesheet` | Xác minh còn dùng ở đâu rồi gỡ | |

Ước tính cho `RequestsService`: các phần duyệt/huỷ/đánh dấu ngày co lại vì `Request` và `Claim` tự nói; phần dựng form giữ nguyên nhưng chỉ còn đọc `Month` và `DayPolicy`.

## 7. Thứ tự chuyển, mỗi bước chạy đủ test

1. Thêm `Claim`, `Day`, `Month`, `DayPolicy` ở dạng **đọc** (dựng từ dữ liệu hiện có: `work_schedules`, `day_status`, `requests`); chưa đụng ghi. Test so với kết quả cũ trên ma trận ngày.
2. Màn nhân viên, lưới Admin, thống kê đọc từ `Month`/`Day`.
3. Tách `evaluate` và `payOf` khỏi `buildAttendanceDay`; giữ test cũ.
4. Chấm công và đơn từ hỏi `DayPolicy`.
5. `Request` thành lớp con; `footprint()` thay các hàm đánh dấu.
6. Gộp lưu trữ vào `Claim`; xoá bảng và cột thừa.
7. `DomainEvent` + `Recalculator` thay các listener.

Bước 1–2 không đổi tiền. Từ bước 3 (đụng công và tiền) trở đi phải qua test so cũ–mới và 12 kịch bản DB thật.

## 8. Câu hỏi mở

1. **Gộp `day_status` và `work_schedules` vào `Claim`** có an toàn không? `work_schedules` còn mang dòng `REGULAR` cũ, trạng thái `COMPLETED/CANCELLED` và phần lịch của iSAT; cần đọc kỹ chỗ nào còn ghi và đọc trước khi chốt. Đề xuất bước đầu: giữ nguyên bảng, chỉ đọc chúng thành `Claim`.
2. **Đơn giải trình:** giữ là `DayExplanation` gắn vào chấm công (đề xuất) hay thành một `Claim`?
3. **`DailyTimesheet`** còn dùng ở đâu, có bỏ được không?
4. **`phase` của ngày `WORK`** dựa trên khoảng ca hay cả khung OT/bù trước và sau ca? Đề xuất: khoảng nhỏ nhất bao cả ca và khung (như `expectedBounds` hiện tại).
5. **Đơn chờ duyệt có đổi `kind` không?** Đề xuất: không, chỉ `day.pending`. Admin vẫn thấy "chờ duyệt" qua `pending`.
6. **Tên:** `Claim` (tạm gọi) có thể đổi thành `DayEntry`, `DayRule`... theo ý chủ dự án.
