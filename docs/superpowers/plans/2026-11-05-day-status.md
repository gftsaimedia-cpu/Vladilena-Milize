# Trạng thái ngày và xung đột giữa các đơn (BE v2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi người, mỗi ngày mang một trạng thái chính, lưu trong bảng `day_status`. Đơn có trước giữ ngày. Đơn mới trùng ngày bị chặn, bị bỏ ngày, hoặc thay ngày, theo ma trận đã chốt. Từ chối hoặc huỷ đơn thì trả ngày lại.

**Architecture:**
- Hàm thuần `planClaims` trong `src/modules/requests/domain/day-status.ts` mã hoá ma trận §2.3 và các câu báo §2.4.
- `DayStatusRepository` đọc và ghi bảng `day_status`. Trạng thái đơn (chờ hay đã duyệt) đọc qua JOIN, không chép vào bảng.
- `RequestsService` ghi bảng trên giao dịch của khoá nhân viên lúc nộp, duyệt, từ chối và huỷ, nên đơn, bảng và lịch luôn ghi cùng nhau.

**Tech Stack:** NestJS 10, Kysely 0.29 + pg, PostgreSQL 16, `node:test` qua `tsx`; FE Vue 3.

**Spec:** `docs/superpowers/specs/2026-11-05-day-status-design.md` (đã duyệt 2026-11-05). Ký hiệu §x, T1–T8, C1–C9, I1–I5 và V1–V6 trong plan là của spec này.

## Global Constraints

- Làm và commit trên nhánh `claude/requests-review-fixes-26c409`. Không merge, không push, không force-push.
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Không chạy `npm run typecheck`, không chạy prettier hay `format:check`.
- Không đọc thư mục `spec/`.
- Không đụng `luong-db` (DB thật) và container `luong-app`.
- Test PostgreSQL chỉ chạy trên một container dùng một lần:
  - mở: `docker run -d --rm --name luong-test-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55432:5432 postgres:16`;
  - chạy test với `PG_TEST_URL=postgres://postgres@127.0.0.1:55432/postgres`;
  - xong thì `docker rm -f luong-test-pg`.
- Test PG có sẵn đang lỗi lúc dọn dẹp: `auth-http.pg` ("terminating connection due to administrator command"). Lỗi này có từ trước, không tính.
- Lược đồ: sửa `migrations/postgres/schema.sql` trực tiếp, không thêm file đánh số.
- File trong `src/modules/requests/domain/` không import Nest, Kysely hay DB.
- Đọc cột DATE bằng `to_char(col, 'YYYY-MM-DD')` trong SQL, như `listScheduleDays`.
- Trong câu báo, ngày viết `dd/MM` bằng `formatDayMonth`. Riêng câu trùng iSAT cũ giữ dạng `dd/MM/yyyy`.
- Câu báo mới, đúng từng chữ (ví dụ với 14/11 và 11/11):
  - C1 `Thứ Bảy 14/11 đã có iSAT được duyệt, không chọn được ngày này.`
  - C2 `Thứ Bảy 14/11 đã có iSAT được duyệt, không tính vào đơn.` (cảnh báo)
  - C3 `Thứ Bảy 14/11 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.`
  - C4 `Ngày 11/11 đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca.` (cảnh báo)
  - C5 `Thứ Bảy 14/11 là ngày lễ, không chọn được cho iSAT.`
  - C6 `Thứ Bảy 14/11 đã nghỉ theo đơn đã duyệt, không chọn được cho iSAT.`
  - C7 `Thứ Bảy 14/11 đang có đơn nghỉ chờ duyệt. Huỷ đơn nghỉ hoặc chọn Thứ Bảy khác.`
  - C8 `Thứ Bảy 14/11 đã có khung OT hoặc làm bù được duyệt, không chọn được cho iSAT.`
  - C9 `Thứ Bảy 14/11 đang có đơn OT chờ duyệt. Huỷ đơn đó hoặc chọn Thứ Bảy khác.` Nếu khung thuộc đơn nghỉ có làm bù thì chữ `đơn OT` thành `đơn nghỉ có làm bù`.
  - Khi duyệt bị chặn: câu của ô bị chặn, thêm ` Chỉ có thể từ chối đơn này.`
- Câu báo cũ giữ nguyên chữ:
  - `Đã có đơn nghỉ trùng ngày (…)`, `Ngày dd/MM đã có khung OT hoặc làm bù`;
  - `Ngày dd/MM đang nghỉ, không đăng ký OT được`, `Ngày dd/MM đang nghỉ, không xếp khung bù được`;
  - `Ngày dd/MM đã có đơn đổi ca khác`, `Đã có đơn iSAT cho Thứ Bảy dd/MM/yyyy`;
  - `Khoảng nghỉ không có ngày làm việc`, `Khoảng đổi ca không có ngày làm việc`.
- Lỗi xung đột ngày:
  - Mã `DAY_CONFLICT`. Lúc nộp trả 400, lúc duyệt trả 409.
  - `details` có `date`, `requestId`, `requestType`, `requestStatus`.
  - Tạo đơn trả `{ created: true, request, warnings }`.

## Review Focus

1. Đơn nghỉ trên ngày đổi ca **đã có khung OT** vẫn bị chặn với câu `Ngày dd/MM đã có khung OT hoặc làm bù`, vì ô "Chặn" thắng ô "thay ca". Test ở Task 3.
2. Khoảng nghỉ bắt đầu hoặc kết thúc đúng vào Thứ Bảy iSAT đã duyệt (14–16/11, 09–14/11): ngày đó vẫn bị bỏ và số ngày đúng. Test ở Task 3.
3. Huỷ một iSAT đang chờ thì Thứ Bảy được trả ngay: đơn nghỉ hoặc OT ngày 14/11 nộp sau đó được nhận. Test ở Task 6.
4. Hai người khác nhau trên cùng một Thứ Bảy: iSAT của Nam không chặn đơn nghỉ của Lan. Test ở Task 3 (fake) và Task 8 (PG).
5. Duyệt đơn đổi ca sau khi một ngày của nó đã bị đơn nghỉ **đã duyệt** thay: lịch `ON_LEAVE` của ngày đó không bị ghi đè. Test ở Task 6.

---

### Task 1: Bảng `day_status` và `DayStatusRepository`

**Files:**
- Modify: `migrations/postgres/schema.sql` (sau `company_holidays`, trước phần "Chỉ mục")
- Modify: `src/database/schema.ts` (thêm `DayStatusTable` và `day_status` vào `DB`)
- Create: `src/modules/requests/day-status.repository.ts`
- Modify: `src/modules/requests/requests.module.ts` (thêm `DayStatusRepository` vào `providers` và `exports`)
- Create: `src/modules/requests/domain/day-status.ts` (lúc này chỉ có các kiểu; Task 2 thêm logic)
- Modify: `src/modules/requests/domain/index.ts` (`export * from './day-status'`)
- Test: `test/v2/day-status-repository.pg.test.ts`

**Interfaces:**
- Produces, trong `domain/day-status.ts`:
  ```ts
  export type ClaimStatus = 'LEAVE' | 'LEAVE_WITH_MAKEUP' | 'SHIFT_CHANGE' | 'ISAT';
  export type ActiveStatus = 'PENDING' | 'APPROVED';
  export interface DayStatusRow { employeeId: string; date: string; status: ClaimStatus; requestId: string; baseRequestId: string | null }
  export interface DayClaim extends DayStatusRow { requestStatus: ActiveStatus; baseRequestStatus: RequestStatus | null }
  ```
- Produces, trong `day-status.repository.ts`, `@Injectable() class DayStatusRepository` (constructor `@Inject(KYSELY_DB) qb: Kysely<DB>`):
  - `withTransaction(trx: Kysely<DB>): DayStatusRepository`
  - `listBetween(employeeId: string, from: string, to: string): Promise<DayClaim[]>`: theo ngày tăng dần, chỉ dòng có đơn `PENDING`/`APPROVED`.
  - `listByRequest(requestId: string): Promise<DayClaim[]>`
  - `listByBase(requestId: string): Promise<DayClaim[]>`
  - `upsert(rows: readonly DayStatusRow[]): Promise<void>`: `INSERT … ON CONFLICT (employee_id, work_date) DO UPDATE` cả `status`, `request_id`, `base_request_id` và `updated_at = now()`.
  - `remove(employeeId: string, dates: readonly string[]): Promise<void>`

- [ ] **Step 1: Viết test PG thất bại.** Dựng DB tạm như `test/v2/requests-review.pg.test.ts` (tạo DB, chạy `schema.sql`, xoá ở cuối, `t.skip` khi thiếu `PG_TEST_URL`). Thêm 2 staff `nv` có uuid và vài đơn `system_requests` chèn thẳng bằng SQL. Các test:
  - `primary key refuses a second row for the same staff and day`: `upsert` hai dòng khác `request_id` cùng `(nv, 2026-11-14)` trong **một** câu `INSERT` (gọi SQL thẳng) thì bị từ chối. `upsert` lần hai qua repository thay dòng cũ: `listBetween` trả đúng một dòng mang `requestId` mới.
  - `check refuses a base request on a SHIFT_CHANGE row`: chèn `status='SHIFT_CHANGE', base_request_id=<id>` thì lỗi, khớp `/day_status_check|check constraint/`.
  - `listBetween joins the request status and hides finished requests`:
    - dòng của đơn `PENDING` có `requestStatus: 'PENDING'`, dòng của đơn `APPROVED` có `'APPROVED'`;
    - dòng của đơn đã đổi sang `REJECTED` không xuất hiện;
    - `date` là chuỗi `'2026-11-14'`;
    - `baseRequestStatus` đúng trạng thái của đơn gốc, hoặc `null`.
  - `listByRequest and listByBase find rows by their request`.
  - `remove deletes only the given days of that staff`.
  - `withTransaction writes roll back with the transaction`: `db.transaction()` ném lỗi sau `upsert`, rồi `listBetween` rỗng.
- [ ] **Step 2: Chạy, thấy fail.** Mở container (Global Constraints), rồi chạy `PG_TEST_URL=postgres://postgres@127.0.0.1:55432/postgres node --import tsx --test test/v2/day-status-repository.pg.test.ts`. Kỳ vọng: FAIL vì không import được `day-status.repository`.
- [ ] **Step 3: Thêm bảng và kiểu.** Thêm bảng y như spec §3, gồm hai chỉ mục và CHECK. Thêm `DayStatusTable` vào `src/database/schema.ts`; `work_date` là `string`, `created_at`/`updated_at` là `Generated<Date>`.
- [ ] **Step 4: Viết `DayStatusRepository` theo Interfaces.**
  - `listBetween`, `listByRequest` và `listByBase` dùng chung một truy vấn chọn:
    - `day_status` JOIN `system_requests r` theo `request_id`;
    - LEFT JOIN `system_requests b` theo `base_request_id`;
    - lọc `r.status IN ('PENDING','APPROVED')`;
    - `work_date` đọc bằng `to_char`;
    - tên cột trả về: `employee_id`, `work_date`, `status`, `request_id`, `base_request_id`, `request_status`, `base_request_status`. Test ở Task 6 (`pg-date-columns`) giả lập đúng các tên này.
  - Đăng ký repository trong `RequestsModule`.
- [ ] **Step 5: Chạy lại test Step 2.** Kỳ vọng: PASS.
- [ ] **Step 6: Commit.** `git add migrations/postgres/schema.sql src/database/schema.ts src/modules/requests/day-status.repository.ts src/modules/requests/requests.module.ts src/modules/requests/domain/day-status.ts src/modules/requests/domain/index.ts test/v2/day-status-repository.pg.test.ts`, rồi `git commit -m "feat(requests): add the day_status table and repository"`.

### Task 2: Hàm thuần `planClaims` (ma trận §2.3)

**Files:**
- Modify: `src/modules/requests/domain/day-status.ts`
- Modify: `src/modules/requests/domain/employee-days.ts`
- Test: `test/v2/day-status-plan.test.ts`

**Interfaces:**
- Consumes: `DayClaim`, `ClaimStatus`, `ActiveStatus` (Task 1).
- Produces, trong `day-status.ts`:
  ```ts
  export type NewRequestKind = 'LEAVE' | 'LEAVE_WITH_MAKEUP' | 'SHIFT_CHANGE' | 'ISAT' | 'OVERTIME' | 'MAKEUP_SLOT' | 'EXPLANATION';
  export interface WindowSource { kind: 'OT' | 'MAKEUP'; requestId: string; requestStatus: ActiveStatus }
  export interface DayView { claimOn(date: string): DayClaim | null; windowSourcesOn(date: string): WindowSource[]; isHoliday(date: string): boolean }
  export interface ClaimPlan { take: Array<{ date: string; replaces: DayClaim | null }>; skipped: string[]; warnings: string[] }
  export class DayConflictError extends Error {
    constructor(message: string, readonly info: { date: string; requestId: string | null; requestType: RequestType | null; requestStatus: RequestStatus | null });
    forReview(): DayConflictError; // cùng info, message + ' Chỉ có thể từ chối đơn này.'
  }
  export function planClaims(input: { kind: NewRequestKind; dates: readonly string[]; days: DayView; ownRequestId?: string }): ClaimPlan;
  ```
- Produces, trong `EmployeeDays`:
  - input mới `claims: readonly DayClaim[]`;
  - `claimOn(date): DayClaim | null`;
  - `windowSourcesOn(date): WindowSource[]`: cùng bộ lọc với `windowsOn`, thêm `requestId` và `requestStatus`;
  - `isOnLeave` **chưa đổi** ở task này; Task 3 mới đổi nó.
  - `shiftOf`, `windowsOn` và `withShiftOverride` giữ nguyên (spec §5).
  - `EmployeeDays` có `implements DayView`.

Quy tắc của `planClaims`:
- `dates`:
  - với `LEAVE`, `LEAVE_WITH_MAKEUP` và `SHIFT_CHANGE`: các ngày làm việc trong khoảng, do service tính sẵn;
  - với các loại còn lại: đúng một ngày.
- Dòng có `requestId === ownRequestId` coi như không có.
- Theo từng ngày, theo thứ tự (dòng nào không ghi thì là "Được, chiếm ngày"):

| Ngày đang là | LEAVE / LWM | SHIFT_CHANGE | ISAT | OVERTIME / MAKEUP_SLOT / EXPLANATION |
|---|---|---|---|---|
| dòng SHIFT_CHANGE | chiếm, `replaces` = dòng đó | lỗi `Ngày dd/MM đã có đơn đổi ca khác` | chiếm, `replaces` = dòng đó | được |
| dòng LEAVE / LWM | lỗi `Ngày dd/MM đã có đơn nghỉ` (phòng hờ) | bỏ ngày, cảnh báo C4 | C6 nếu đơn đó đã duyệt, C7 nếu đang chờ | được (service vẫn kiểm `isOnLeave` cho OT và khung bù như cũ) |
| dòng ISAT đã duyệt | bỏ ngày, cảnh báo C2 | bỏ ngày, cảnh báo C2 | lỗi `Đã có đơn iSAT cho Thứ Bảy dd/MM/yyyy` | C1 |
| dòng ISAT đang chờ | C3 | C3 | lỗi trùng iSAT như trên | C3 |

- Riêng `ISAT`, xét theo thứ tự:
  1. `isHoliday` thì C5;
  2. kiểm theo dòng của ngày (bảng trên);
  3. `windowSourcesOn`: có khung `APPROVED` thì C8; nếu không, có khung `PENDING` thì C9, gọi tên theo `kind` của khung chờ đầu tiên.
- Lỗi nào cũng ném `DayConflictError`. `info.date` là ngày lỗi; `requestId`, `requestType` và `requestStatus` là của đơn gây chặn. Riêng C5 thì ba trường này là `null`.
- Đơn theo khoảng:
  - xét hết các ngày, gặp lỗi ở ngày đầu tiên thì ném ngay;
  - không lỗi mà `take` rỗng: nếu mọi ngày bị bỏ vì ISAT đã duyệt thì C1 theo ngày bị bỏ đầu tiên; còn lại thì câu cũ "Khoảng nghỉ/đổi ca không có ngày làm việc".
  - Không lỗi và `take` không rỗng thì trả kết quả, gồm `skipped` và `warnings` theo thứ tự ngày.

- [ ] **Step 1: Viết test thất bại** `test/v2/day-status-plan.test.ts`.
  - Dựng `DayView` giả từ một map dòng, một map khung và một tập ngày lễ.
  - Mỗi ô của bảng trên có một test, với cả biến thể chờ và đã duyệt. Tên test theo dạng `LEAVE on approved ISAT skips the day with C2`. Câu báo so bằng `assert.equal` đúng từng chữ như Global Constraints.
  - Thêm các test sau:
    - `range 12–16/11 over approved ISAT 14/11 takes 12, 13, 16`;
    - `range made only of approved ISAT days throws C1 on the first`;
    - `pending ISAT inside a range wins over an approved ISAT earlier in the range` (C3);
    - `range with no taken day and no ISAT throws the old empty-range message`;
    - `ownRequestId rows count as free`;
    - `ISAT on a holiday throws C5 with null request info`;
    - `ISAT prefers C8 when both approved and pending windows exist`;
    - `C9 names the leave-with-makeup request for a MAKEUP window`;
    - `forReview appends the reviewer sentence and keeps info`.
  - Trong `test/v2/requests-context.test.ts`, thêm test cho `EmployeeDays`:
    - `claimOn` trả đúng dòng của ngày, hoặc `null`;
    - `windowSourcesOn` trả đúng `requestId` và `requestStatus`.
- [ ] **Step 2: Chạy, thấy fail.** `node --import tsx --test test/v2/day-status-plan.test.ts test/v2/requests-context.test.ts`. Kỳ vọng: FAIL vì `planClaims` và `claimOn` chưa có.
- [ ] **Step 3: Viết `planClaims`, `DayConflictError` và các đổi trong `EmployeeDays`** theo Interfaces và bảng trên. Hàm `loadDays` của service tạm truyền `claims: []`; Task 3 sẽ nối dữ liệu thật.
- [ ] **Step 4: Chạy lại Step 2, rồi `npm test`.** Kỳ vọng: PASS toàn bộ, vì service chưa gọi `planClaims`.
- [ ] **Step 5: Commit.** `git commit -m "feat(requests): encode the day conflict matrix in planClaims"`

### Task 3: Fake, `loadDays` đọc `day_status`, nộp đơn nghỉ và nghỉ có làm bù

**Files:**
- Modify: `test/v2/helpers/requests-fakes.ts`
- Modify: `src/modules/requests/requests.service.ts`
- Create: `test/v2/requests-day-status.test.ts`
- Modify (gieo dữ liệu): `test/v2/requests-leave.test.ts`, `test/v2/requests-makeup.test.ts`, `test/v2/requests-context.test.ts`

**Interfaces:**
- Consumes: `DayStatusRepository` (Task 1); `planClaims`, `DayConflictError`, `DayClaim` (Task 2).
- Produces:
  - Constructor của `RequestsService` có thêm tham số thứ 5: `@Optional() @Inject(DayStatusRepository) dayStatusRepo?: DayStatusRepository`.
  - `RequestStores.days?: DayStatusRepository`. `storesOn(trx)` gắn nó vào trx.
  - `loadDays` kiểm `stores.holidays` trước (câu cũ `Thiếu lịch lễ công ty`), rồi kiểm `stores.days`: thiếu thì `Thiếu bảng trạng thái ngày`. Hàm đọc `days.listBetween(employeeId, lo, hi)` vào `claims`.
  - `EmployeeDays.isOnLeave(date)` chỉ còn đọc `claims` có `status` là `LEAVE` hoặc `LEAVE_WITH_MAKEUP`. Hàm không còn đọc lịch `ON_LEAVE` hay danh sách đơn.
  - `export type CreatedRequestDTO = SystemRequestDTO & { warnings: string[] }`. Mọi `create*` trả kiểu này; `createAdvanceRequest` trả `warnings: []`.
  - `private async claimDays(stores, req: SystemRequest, plan: ClaimPlan, status: ClaimStatus): Promise<void>`:
    - mỗi phần tử `take` thành một `DayStatusRow` với `baseRequestId = replaces?.requestId ?? null`;
    - gọi `stores.days.upsert` **sau** `stores.requests.save(req)`.
- Produces, trong fake:
  - `class FakeDayStatusRepository extends DayStatusRepository`, có `trx`, `calls`, `withTransaction`, và `rows: Map<string, DayStatusRow>` theo khoá `${employeeId}:${date}`.
  - Constructor nhận `source: { requests: Map<string, SystemRequest> }` để biết trạng thái đơn khi trả `DayClaim`. Kiểu này hợp với cả fake chung lẫn fake riêng của `requests-isat-service.test.ts`.
  - Các phương thức đọc chỉ trả dòng có đơn đang chờ hoặc đã duyệt, như JOIN thật.
  - `makeService()` trả thêm `days`.
  - `export function isatRequest(saturday: string, status: 'PENDING' | 'APPROVED' = 'PENDING', extra?: { employeeId?: string }): SystemRequest`: dựng bằng `SystemRequest.createIsatRequest` (đủ 4 điều kiện, ảnh hồ sơ nv). Khi cần đã duyệt thì `approve(ADMIN_UUID)`.
  - `export async function seed(ctx, req: SystemRequest, dates?: string[]): Promise<SystemRequest>`:
    - lưu đơn;
    - nếu đơn là LEAVE, LWM, SHIFT_CHANGE hoặc ISAT và đang chờ hoặc đã duyệt thì ghi dòng: `dates` nếu có truyền; nếu không thì các ngày trong khoảng có thứ thuộc `regularDows` của người đó và không là ngày lễ của `ctx.holidays`; ISAT thì đúng Thứ Bảy.

Luồng nộp (`createLeaveRequest`, `createLeaveWithMakeupRequest`), trong khoá:
1. `loadDays`.
2. `assertLeaveRangeFree`: giữ nguyên, câu cũ.
3. `planClaims({ kind, dates: days.workingDaysBetween(start, end), days })`.
4. Số ngày và số giờ bù tính theo `plan.take.length`. Số dư Phép năm cũng so với `plan.take.length`.
5. Lưu đơn, rồi `claimDays`.
6. Trả `{ ...req.toJSON(), warnings: plan.warnings }`.

Câu `Khoảng nghỉ không có ngày làm việc` khi khoảng không có ngày làm việc nào vẫn báo như cũ, trước `planClaims`.

- [ ] **Step 1: Viết test thất bại** trong `test/v2/requests-day-status.test.ts`. Dùng `makeService()`, `seed(...)` và nv01 (T2–T7).
  - `V1 leave 12–16/11 over approved ISAT 14/11 counts 3 days and warns C2`:
    - `leaveDaysCount === 3`;
    - `warnings` là `[C2]`;
    - `days.rows` có 12, 13, 16 kiểu LEAVE của đơn mới; 14 vẫn ISAT.
  - `V2 leave over pending ISAT 14/11 is refused with C3 and writes nothing`: `assert.rejects` với `DayConflictError` và câu C3; số đơn và số dòng không đổi.
  - `V3a leave 11/11 on a pending shift change replaces the day`: dòng 11 có `status: 'LEAVE'` và `baseRequestId` là id đơn đổi ca. Dòng 10 và 12 vẫn SHIFT_CHANGE.
  - `leave with makeup over approved ISAT owes 8 hours per counted day`: LWM 13–14/11 với iSAT đã duyệt 14/11 thì cần đúng 480 phút; xếp 960 phút thì báo `Cần đúng 8 giờ bù, đang xếp 16 giờ`.
  - `annual leave balance ignores the skipped ISAT day`: số dư 2, xin 12–14/11 có iSAT 14/11 đã duyệt thì được nhận.
  - Review Focus 1, `leave on a shift-change day that has an OT window is still refused`: báo `Ngày 11/11 đã có khung OT hoặc làm bù`.
  - Review Focus 2, `range edges on an approved ISAT Saturday`:
    - 14–16/11 tính 1 ngày (16; 15 là CN);
    - 09–14/11 tính 5 ngày.
  - Review Focus 4, `another staff's ISAT does not block this leave`: thêm nhân viên thứ hai `nv02` bằng `putStaff('nv02', staffContext({ employeeId: <uuid mới> }))` và gieo cho người đó một iSAT 14/11 đã duyệt. Đơn nghỉ 14/11 của nv01 được nhận với `warnings: []`.
  - `every day_status write runs on the lock transaction`: mọi mục `upsert` trong `days.calls` mang `LOCK_TRX`.
- [ ] **Step 2: Chạy, thấy fail.** `node --import tsx --test test/v2/requests-day-status.test.ts`. Kỳ vọng: FAIL vì `seed` và `days` chưa có.
- [ ] **Step 3: Thêm fake và helper**, rồi sửa service theo Interfaces và luồng nộp ở trên.
- [ ] **Step 4: Sửa phần gieo dữ liệu của test cũ.** Đổi `ctx.repo.save(X)` thành `seed(ctx, X)` cho mọi đơn LEAVE, LWM, SHIFT_CHANGE hoặc ISAT đang chờ hoặc đã duyệt:
  - `requests-leave.test.ts`: dòng 82, 85, 89, 115, 116, 121;
  - `requests-makeup.test.ts`: 105, 143;
  - `requests-shift-change.test.ts`: 65, 90, 96, 102;
  - `requests-overtime.test.ts`: 77, 106;
  - `requests-review.test.ts`: mọi đơn nghỉ hoặc đổi ca được gieo.

  Lịch `onLeave: true` không còn làm ngày "đang nghỉ", nên sửa thêm:
  - `requests-overtime.test.ts:79-80`: thay lịch `onLeave` ngày 14/11 bằng `seed` một đơn nghỉ đã duyệt ngày 14/11. Câu kỳ vọng giữ nguyên.
  - `requests-context.test.ts`:
    - các test `EmployeeDays` ở dòng 41, 84 và 259 đang dùng lịch `onLeave: true` để có ngày nghỉ: chuyển sang `claims` có dòng `LEAVE`;
    - thêm một kiểm: lịch `onLeave: true` mà không có dòng thì `isOnLeave` là `false`;
    - test `loadDays reads one day either side…`: gieo đơn `pending` bằng `seed`. Giữ các kiểm `repo.scheduleRanges` và `holidays.ranges`, thêm kiểm `days` được đọc đúng khoảng `[2026-11-11, 2026-11-14]`.

  Test `loadDays without the holiday repository fails loudly` giữ nguyên câu cũ.
- [ ] **Step 5: Chạy.**
  - `node --import tsx --test test/v2/requests-day-status.test.ts test/v2/requests-leave.test.ts test/v2/requests-makeup.test.ts test/v2/requests-context.test.ts test/v2/requests-overtime.test.ts test/v2/requests-shift-change.test.ts`. Kỳ vọng: PASS.
  - `npm test`. Kỳ vọng: PASS toàn bộ. Nếu còn test nào fail vì đơn được gieo mà thiếu dòng, đổi sang `seed` và ghi tên file vào báo cáo của task.
- [ ] **Step 6: Commit.** `git commit -m "feat(requests): leave requests claim their days in day_status"`

### Task 4: Đổi ca, OT, khung bù và giải trình theo `day_status`

**Files:**
- Modify: `src/modules/requests/requests.service.ts` (`createShiftChangeRequest`, `createOvertimeRequest`, phần khung bù của `createLeaveWithMakeupRequest`, `createExplanationRequest`)
- Modify: `test/v2/requests-day-status.test.ts`
- Modify (gieo dữ liệu, câu báo): `test/v2/requests-shift-change.test.ts`, `test/v2/requests-overtime.test.ts`, `test/v2/requests-explanation.test.ts`

**Interfaces:**
- Consumes: `planClaims`, `claimDays`, `CreatedRequestDTO` và `seed` (Task 2–3).
- Produces:
  - đổi ca ghi dòng `SHIFT_CHANGE` chỉ cho `plan.take`;
  - OT, khung bù và giải trình không ghi dòng nào.

Đổi ca:
- Bỏ vòng `if (days.isOnLeave(date)) throw …` trong `createShiftChangeRequest`.
- Giữ kiểm trùng đơn đổi ca khác (câu cũ). Kiểm này chạy trên `plan.take`.
- `planClaims({ kind: 'SHIFT_CHANGE', dates: changed, days })`.
- Phần kiểm khung OT/bù và giới hạn 12 giờ chạy trên `plan.take` và ngày hôm sau của từng ngày đó.
- Lưu đơn, `claimDays(…, 'SHIFT_CHANGE')`, trả `warnings`.

OT, khung bù, giải trình:
- Gọi `planClaims` với ngày của đơn, trước các kiểm cũ:
  - OT: `kind: 'OVERTIME'`, ngày `otDate`;
  - khung bù: `kind: 'MAKEUP_SLOT'`, từng `slot.date`;
  - giải trình: `kind: 'EXPLANATION'`, ngày `workDate`.
- Giải trình hiện chưa gọi `loadDays`. Hàm gọi `loadDays(staff, workDate, workDate, stores)` trong khoá. Loại nhân sự chưa cấu hình thì vẫn được giải trình như v2: bọc `requireTypeConfig`; khi thiếu thì bỏ qua `planClaims`.

  Ruling: giải trình của loại nhân sự chưa cấu hình không được kiểm iSAT — lý do: v2 cho giải trình mà không cần cấu hình loại, và nhóm có iSAT (nv) luôn có cấu hình — rủi ro nếu sai: rất thấp, chỉ khi dữ liệu loại nhân sự hỏng.

- [ ] **Step 1: Viết test thất bại** (thêm vào `requests-day-status.test.ts`):
  - `V4 shift change 10–13/11 over pending leave 11/11 takes 10, 12, 13 and warns C4`: dòng 11 vẫn là LEAVE của đơn nghỉ.
  - `shift change over approved ISAT 14/11 skips it with C2` (khoảng 13–14/11): dòng 14 vẫn ISAT.
  - `shift change touching pending ISAT is refused with C3`.
  - `shift change whose days are all on leave is refused with the old empty-range message`.
  - `OT on approved ISAT 14/11 is refused with C1`, và với iSAT đang chờ thì C3.
  - `makeup slot on approved ISAT is refused with C1`: LWM 12/11, khung bù 14/11.
  - `explanation for an approved ISAT Saturday is refused with C1`: `service.now` cố định 2026-11-04, dùng Thứ Bảy 2026-10-31 đã duyệt. Với iSAT đang chờ thì C3.
  - `OT on a leave day keeps the old message`: báo `Ngày 12/11 đang nghỉ, không đăng ký OT được`.
- [ ] **Step 2: Chạy, thấy fail.** `node --import tsx --test test/v2/requests-day-status.test.ts`.
- [ ] **Step 3: Sửa service** theo phần mô tả ở trên.
- [ ] **Step 4: Sửa test cũ.**
  - Test `requests-shift-change.test.ts:102-103` (đổi ca trên ngày nghỉ đã duyệt) đang kỳ vọng lỗi `đang nghỉ, không đổi ca được`. Đổi sang kỳ vọng theo T4:
    - nếu khoảng chỉ có ngày đó thì báo `Khoảng đổi ca không có ngày làm việc`;
    - nếu khoảng có ngày khác thì đơn được nhận với cảnh báo C4.
  - Chọn đúng một trong hai theo khoảng mà test đang dùng.
- [ ] **Step 5: Chạy.**
  - `node --import tsx --test test/v2/requests-day-status.test.ts test/v2/requests-shift-change.test.ts test/v2/requests-overtime.test.ts test/v2/requests-explanation.test.ts test/v2/requests-makeup.test.ts`. Kỳ vọng: PASS.
  - `npm test`. Kỳ vọng: PASS toàn bộ.
- [ ] **Step 6: Commit.** `git commit -m "feat(requests): shift change, OT, makeup and explanations respect day_status"`

### Task 5: Nộp iSAT dưới khoá nhân viên

**Files:**
- Modify: `src/modules/requests/requests.service.ts` (`createIsatRequest`)
- Modify: `test/v2/requests-day-status.test.ts`
- Modify: `test/v2/requests-isat-service.test.ts` (fake riêng của file)

**Interfaces:**
- Consumes: `resolveStaff`, `loadDays`, `underEmployeeLock`, `planClaims` và `claimDays`.
- Produces: đơn iSAT đang chờ ghi một dòng `ISAT`. Đơn iSAT bị domain tự từ chối không ghi dòng nào.

Luồng `createIsatRequest`:
1. `findIsatProfile` vẫn chạy **trước** mọi thứ, như cũ. `business-today.test.ts` kiểm tháng của lần gọi này.
2. Kiểm `isatEnabled`.
3. `SystemRequest.createIsatRequest`.
4. `resolveStaff(profile.employeeId, monthOf(saturday))`.
5. `underEmployeeLock`, trong khoá:
   1. kiểm trùng iSAT bằng `stores.requests.list` (câu cũ);
   2. nếu đơn `PENDING`: `loadDays(staff, saturday, saturday, stores)`, rồi `planClaims({ kind: 'ISAT', dates: [saturday], days })`;
   3. lưu đơn;
   4. nếu `PENDING` thì `claimDays(…, 'ISAT')`;
   5. trả `warnings: []`.

- [ ] **Step 1: Viết test thất bại** (thêm vào `requests-day-status.test.ts`):
  - `ISAT on a holiday Saturday is refused with C5`.
  - `ISAT on a Saturday with an approved leave is refused with C6`; với đơn nghỉ đang chờ thì C7.
  - `V6 ISAT on a Saturday with a pending OT window is refused with C9`; với khung OT đã duyệt thì C8; với khung bù đang chờ thì C9 ghi `đơn nghỉ có làm bù`.
  - `ISAT on a shift-changed Saturday replaces the day` (bước nộp của V5): dòng 14 là ISAT, `baseRequestId` là id đơn đổi ca.
  - `ISAT runs under the employee lock`: `lock.keys` có `requests_${NV_UUID}`.
  - `auto-rejected ISAT writes no day`.
- [ ] **Step 2: Chạy, thấy fail.** `node --import tsx --test test/v2/requests-day-status.test.ts`.
- [ ] **Step 3: Sửa `createIsatRequest`** theo luồng trên.
- [ ] **Step 4: Sửa fake của `requests-isat-service.test.ts`.**
  - Thêm vào `FakeRequestsRepository` cục bộ:
    - `findStaffContext(id)`: trả `staffContext({ employeeId: profile.employeeId })` của hồ sơ tìm được, hoặc `null`;
    - `listScheduleDays()`: `[]`;
    - `listActive(id)`: các đơn đang chờ hoặc đã duyệt của người đó.
  - Dựng service bằng `new RequestsService(reqRepo, attRepo, undefined, new FakeHolidaysRepository(), new FakeDayStatusRepository(reqRepo))`. Hai fake sau import từ `helpers/requests-fakes`.
  - Test `approves without an attendance repository` dựng service với `undefined` ở vị trí attendance và vẫn có holidays/days.
- [ ] **Step 5: Chạy.**
  - `node --import tsx --test test/v2/requests-day-status.test.ts test/v2/requests-isat-service.test.ts test/v2/business-today.test.ts`. Kỳ vọng: PASS.
  - `npm test`. Kỳ vọng: PASS toàn bộ.
- [ ] **Step 6: Commit.** `git commit -m "feat(requests): file ISAT under the employee lock and claim its Saturday"`

### Task 6: Duyệt, từ chối và huỷ

**Files:**
- Modify: `src/modules/requests/requests.service.ts` (`underLock`, `reviewRequest`, `cancelRequest`, `markLeaveDays`, `markShiftChangeDays`, phần ghi lịch iSAT)
- Modify: `test/v2/helpers/requests-fakes.ts` (`RecordingLock.acquireAdvisoryLock`)
- Modify: `test/v2/requests-day-status.test.ts`
- Modify (gieo dữ liệu và dựng service): `test/v2/requests-review.test.ts`, `test/v2/requests-persistence.test.ts`, `test/v2/pg-date-columns.test.ts`, `test/v2/requests-review.pg.test.ts`

**Interfaces:**
- Consumes: mọi thứ của Task 1–5.
- Produces:
  - `underLock<T>(key, fn: (stores: RequestStores, trx?: DatabaseTransaction) => Promise<T>)`.
  - `private async lockEmployee(trx: DatabaseTransaction | undefined, employeeId: string): Promise<void>`: gọi `txCoordinator.acquireAdvisoryLock(trx, \`requests_${employeeId}\`)` khi có cả hai.
  - `RecordingLock.acquireAdvisoryLock(trx, key)`: chỉ đẩy `key` vào `keys`.
  - `private async recheck(req, stores): Promise<void>`: ném `DayConflictError.forReview()`.
  - `private async releaseDays(req, stores): Promise<void>`: theo §4.3.

`reviewRequest` trong khoá `request_<id>`:
1. `findById`, tra người duyệt (như cũ).
2. `lockEmployee(trx, req.employeeId)`.
3. Khi `APPROVE`, chạy `recheck`:
   - với LEAVE, LWM, SHIFT_CHANGE, ISAT, OVERTIME và EXPLANATION;
   - `planClaims` với `ownRequestId: req.id`, cùng `kind` và `dates` như lúc nộp;
   - dùng `loadDays` trên khoảng của đơn.

   Ruling: `recheck` không xét lại khung bù của đơn nghỉ có làm bù — lý do: khung bù không chiếm ngày, và mọi chặn của khung bù đã kiểm lúc nộp với cả đơn đang chờ — rủi ro nếu sai: một khung bù lọt vào Thứ Bảy iSAT nhờ dữ liệu sai sẽ không bị chặn lúc duyệt.
4. Ghi lịch theo `days.listByRequest(req.id)`, thay cho `workingDaysBetween`:
   - LEAVE và LWM: `withLeave`;
   - SHIFT_CHANGE: `withShiftChange`;
   - ISAT: `withIsat`;
   - OT, giải trình và tạm ứng: như cũ.
5. Khi `REJECT`: `releaseDays`.
6. Lưu đơn.

`cancelRequest`:
- chạy trong `underLock('request_<id>')`, rồi `lockEmployee`;
- `req.cancel(…)`, rồi `releaseDays`, rồi lưu.

`releaseDays`:
- Với mỗi dòng của `listByRequest(req.id)`:
  - nếu `baseRequestStatus` là PENDING hoặc APPROVED: `upsert` dòng `SHIFT_CHANGE` của đơn gốc với `baseRequestId: null`. Nếu đơn gốc đã duyệt thì ghi thêm lịch ngày đó bằng `withShiftChange`, lấy giờ từ `stores.requests.findById(base)`.
  - còn lại: gom ngày rồi `remove`.
- Với mỗi dòng của `listByBase(req.id)`: `upsert` lại dòng đó với `baseRequestId: null`.

- [ ] **Step 1: Viết test thất bại** (thêm vào `requests-day-status.test.ts`):
  - `V1 approve writes ON_LEAVE only on the claimed days`: lịch 12, 13, 16 có trạng thái `ON_LEAVE`; lịch 14 không bị đơn nghỉ đụng tới.
  - `V3b rejecting the leave hands 11/11 back to the pending shift change`: dòng 11 là SHIFT_CHANGE của đơn đổi ca, `baseRequestId: null`.
  - `rejecting a leave over an approved shift change rewrites that day's schedule`: lịch 11 có `scheduleType: 'SHIFT_CHANGE'` và giờ 22:00 / 07:00.
  - `V4b rejecting the leave frees 11/11 to the regular shift`: không còn dòng 11.
  - `V5 approving ISAT on a shift-changed Saturday writes withIsat, and approving the shift change later leaves the Saturday alone`.
  - `cancelling a shift change clears the base on replaced days`: dòng nghỉ còn nguyên, `baseRequestId: null`.
  - Review Focus 3, `cancelling a pending ISAT frees the Saturday`: sau khi huỷ, đơn nghỉ 14/11 được nhận và OT 14/11 được nhận.
  - Review Focus 5, `approving a shift change after an approved leave took a day keeps ON_LEAVE`.
  - `approval recheck refuses a conflicting request and writes nothing`:
    - gieo bằng tay một dòng ISAT đã duyệt trên ngày của một đơn OT đang chờ;
    - duyệt OT thì `rejects` với `DayConflictError`, câu C1 + ` Chỉ có thể từ chối đơn này.`;
    - đơn vẫn `PENDING`, `att.schedules` không đổi.
  - `review takes the request lock then the employee lock`: `lock.keys` là `[request_<id>, requests_<uuid>]`.
  - `cancel takes the same two locks and writes on the lock transaction`.
- [ ] **Step 2: Chạy, thấy fail.** `node --import tsx --test test/v2/requests-day-status.test.ts`.
- [ ] **Step 3: Sửa service và `RecordingLock`** theo Interfaces và các mô tả ở trên.
- [ ] **Step 4: Sửa test cũ.**
  - `requests-review.test.ts`: các mục kiểm `calls` có thêm `listByRequest`/`listBetween` trên `LOCK_TRX`; `lock.keys` có thêm `requests_<uuid>` sau `request_<id>`.
  - `requests-persistence.test.ts` (`approving OT writes no schedule`): dựng service bằng `makeService()` và gieo OT bằng `repo.save`.
  - `pg-date-columns.test.ts`:
    - truyền `new DayStatusRepository(db)` ở vị trí thứ 5;
    - script trả về cho `from "day_status"` một dòng `{ employee_id, work_date: '2026-11-06', status: 'LEAVE', request_id: leave.id, base_request_id: null, request_status: 'PENDING', base_request_status: null }` khi truy vấn theo `request_id`, và `[]` cho các truy vấn khác;
    - giữ nguyên kỳ vọng ghi lịch đúng ngày 06/11.
  - `requests-review.pg.test.ts`: `serviceOn` truyền thêm `new DayStatusRepository(db)`.
- [ ] **Step 5: Chạy.**
  - `npm test`. Kỳ vọng: PASS toàn bộ (không PG).
  - Với `PG_TEST_URL`: `node --import tsx --test test/v2/requests-review.pg.test.ts test/v2/day-status-repository.pg.test.ts`. Kỳ vọng: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(requests): review and cancel keep day_status and schedules in step"`

### Task 7: API — `warnings`, lỗi `DAY_CONFLICT`, tài liệu

**Files:**
- Create: `src/modules/requests/request-http.ts`
- Modify: `src/modules/requests/requests.controller.ts` (7 route tạo đơn, `review`, `cancel`)
- Modify: `src/modules/me/me.controller.ts` (`createRequest`, `cancelRequest`)
- Modify: `docs/api/v2-contract.md` §3.4
- Test: `test/v2/requests-day-conflict-http.test.ts`

**Interfaces:**
- Produces, trong `request-http.ts`:
  - `createdBody(dto: CreatedRequestDTO): { created: true; request: SystemRequestDTO; warnings: string[] }`: tách `warnings` khỏi `request`.
  - `dayConflictHttp(err: unknown, status: 400 | 409): HttpError | null`: là `DayConflictError` thì trả `BadRequestError` (400) hoặc `ConflictError` (409) với `{ code: 'DAY_CONFLICT', ...err.info }`; không phải thì `null`.
- Các route tạo đơn gọi `dayConflictHttp(err, 400)` trước khi bọc lỗi như cũ. `review` gọi `dayConflictHttp(err, 409)`. `cancel` của cả hai controller giữ mã lỗi cũ.

Ruling: test gọi thẳng phương thức controller với service thật trên fake, thay cho test HTTP sống — lý do: route và bộ lọc lỗi không đổi; thứ cần kiểm là thân trả về và mã lỗi, mà controller tạo ra — rủi ro nếu sai: lỗi đăng ký route sẽ không bị bắt. Route hiện có đã có test riêng.

- [ ] **Step 1: Viết test thất bại** `test/v2/requests-day-conflict-http.test.ts`. Dựng `RequestsController` và `MeController` (giả `req.user`/`who()` như các test controller hiện có) trên `makeService()`.
  - `POST leave over approved ISAT returns warnings`: thân là `{ created: true, request, warnings: [C2] }`, và `request` không có `warnings`.
  - `POST leave over pending ISAT throws 400 DAY_CONFLICT with details`: `status === 400`, `details` bằng `{ code: 'DAY_CONFLICT', date: '2026-11-14', requestId: <iSAT id>, requestType: 'ISAT', requestStatus: 'PENDING' }`.
  - `review blocked by recheck throws 409 DAY_CONFLICT`.
  - `me/requests/leave returns the same body and error`.
  - `POST advance returns warnings []`.
- [ ] **Step 2: Chạy, thấy fail.** `node --import tsx --test test/v2/requests-day-conflict-http.test.ts`.
- [ ] **Step 3: Viết `request-http.ts` và sửa hai controller.**
- [ ] **Step 4: Sửa tài liệu.** Trong `docs/api/v2-contract.md` §3.4, ghi:
  - trường `warnings` trong thân tạo đơn;
  - lỗi `DAY_CONFLICT`: 400 lúc nộp, 409 lúc duyệt, kèm `details`;
  - bảng tóm tắt ma trận §2.3 (chỉ các ô "Mới");
  - tác động của duyệt, từ chối và huỷ lên `day_status`.
- [ ] **Step 5: Chạy.** `node --import tsx --test test/v2/requests-day-conflict-http.test.ts`, rồi `npm test`. Kỳ vọng: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(requests): return day warnings and DAY_CONFLICT errors from the API"`

### Task 8: Bộ kịch bản PostgreSQL (V1–V6, I1–I5, đồng thời, nguyên khối)

**Files:**
- Test: `test/v2/day-status.pg.test.ts`

**Interfaces:**
- Consumes: service đầy đủ trên Kysely thật, gồm `TransactionCoordinator`, `RequestsRepository`, `AttendanceRepository`, `HolidaysRepository` và `DayStatusRepository`. `service.now` cố định `2026-11-04T10:00:00Z`.
- Produces, trong file test: `async function assertInvariants(client: Client, employeeId: string)`. Mỗi bất biến là một câu SQL phải trả 0 dòng:
  - I2: dòng có đơn không ở `PENDING`/`APPROVED`, hoặc `r.type <> ds.status`, hoặc `r.employee_id <> ds.employee_id`.
  - I3: dòng có `base_request_id` mà đơn gốc không phải `SHIFT_CHANGE` đang chờ hoặc đã duyệt của cùng người, hoặc khoảng `change_start_date..change_end_date` của đơn gốc không chứa `work_date`.
  - I4: dòng của đơn `APPROVED` mà `work_schedules` cùng ngày không khớp:
    - LEAVE/LWM cần `status='ON_LEAVE'`;
    - ISAT cần `schedule_type='ISAT'`;
    - SHIFT_CHANGE cần `schedule_type='SHIFT_CHANGE'` và `to_char(planned_start_time,'HH24:MI') = r.new_start_time`.
  - I5: dòng LEAVE/LWM/ISAT trùng ngày với `ot_date` của một đơn OT đang chờ hoặc đã duyệt, hoặc với `makeup_slots.work_date` của một đơn LWM đang chờ hoặc đã duyệt.
  - I1 do khoá chính bảo đảm. Test Task 1 đã kiểm.

- [ ] **Step 1: Viết test.** Dựng DB tạm như Task 1. Có staff `nv` cho Nam và Lan, staff admin, và ngày lễ Thứ Bảy 2026-11-21. Các test:
  - `V1`–`V6` theo bảng §4.4, mỗi kịch bản chạy hết vòng nộp, duyệt hoặc từ chối, rồi `assertInvariants`.
  - `Lan's leave is not blocked by Nam's ISAT on the same Saturday` (Review Focus 4).
  - `filing ISAT 14/11 and leave 12–16/11 at the same time lets exactly one in`: `Promise.allSettled` trên hai service dùng chung một pool. Đúng 1 `fulfilled`; lỗi còn lại là `DayConflictError` C3 hoặc C7; sau đó `assertInvariants`.
  - `rejecting one request while filing another for the same staff keeps the table consistent`.
  - `a failing day_status insert rolls back the request`: trigger `BEFORE INSERT ON day_status` ném lỗi khi `work_date = '2026-11-20'`. Nộp nghỉ 19–20/11 thì lỗi; sau đó không còn đơn nào và không còn dòng 19/11.
  - `a failing schedule write during release rolls back the hand-back`: trigger trên `work_schedules`. Từ chối đơn nghỉ đã thay ngày của một đổi ca đã duyệt thì lỗi; đơn nghỉ vẫn `PENDING`, dòng vẫn LEAVE.
  - `review with two locks does not starve a two-connection pool`: dựng `createKysely(new Pool({ connectionString, max: 2, connectionTimeoutMillis: 3000 }))`, như `requests-review.pg.test.ts:151`. Hai việc duyệt và hai việc nộp cho 4 người chạy song song, tất cả `fulfilled`, xong dưới 15 giây.
- [ ] **Step 2: Chạy.** `PG_TEST_URL=… node --import tsx --test test/v2/day-status.pg.test.ts`. Test nào fail thì dùng `superpowers:systematic-debugging` tìm nguyên nhân gốc trong code của Task 1–7, sửa đúng một chỗ, và thêm test fake tương ứng vào `requests-day-status.test.ts`.
- [ ] **Step 3: Commit.** `git commit -m "test(requests): day_status scenarios, invariants and concurrency on PostgreSQL"`

### Task 9: FE hiện lỗi duyệt, xác minh toàn bộ

**Files:**
- Modify: `web/src/services/admin-main.ts` (`resolveRequest`)

`resolveRequest`:
- Giữ nguyên nhánh 404/400 trả `null`.
- Với `ApiError` khác thì gọi `toast.error(e.message)` rồi ném lại. Màn Yêu cầu, chuông và Tổng quan nhờ vậy hiện được câu "… Chỉ có thể từ chối đơn này."
- `BulkApproveDialog` đã hiện `res.message`, không cần sửa.

Ruling: không thêm test tự động cho thay đổi này — lý do: test giao diện chạy ở chế độ dữ liệu giả, mà ở chế độ đó `resolveRequest` không gọi máy chủ; test màn Yêu cầu hiện cũng đang `fixme` — rủi ro nếu sai: Admin không thấy câu báo khi duyệt bị chặn. Phần BE đã có test ở Task 7.

- [ ] **Step 1: Sửa `resolveRequest`** như trên.
- [ ] **Step 2: Chạy test giao diện.** `cd web && PW_PORT=4193 npm run test:ui`. Kỳ vọng: không có test nào fail mới. Lần gần nhất là 253 pass, 15 skip.
- [ ] **Step 3: Chạy xác minh toàn bộ BE.** Mở container, rồi `PG_TEST_URL=postgres://postgres@127.0.0.1:55432/postgres npm test`. Kỳ vọng: mọi test pass, trừ `auth-http.pg` (lỗi dọn dẹp có sẵn). Xong thì `docker rm -f luong-test-pg`.
- [ ] **Step 4: Commit.** `git commit -m "fix(web): show the server's message when an approval is refused"`
