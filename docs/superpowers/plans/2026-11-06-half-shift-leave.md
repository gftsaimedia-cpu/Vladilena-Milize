# Nghỉ giữa ca — Kế hoạch triển khai

> **Cho agent thực thi (Agy):** làm tuần tự từng task, theo đúng thứ tự. Mỗi bước có hộp kiểm `- [ ]`; tích khi xong. Làm đúng chuỗi đỏ → xanh: viết test, chạy thấy nó **đỏ đúng lý do**, rồi mới viết code. Không dùng subagent.

**Mục tiêu:** thêm loại đơn "Nghỉ giữa ca" (làm nửa ca rồi về, nợ 240 phút bù bằng form Làm thêm giờ), kèm ngày công nửa công, phiếu lương và bộ đếm nợ riêng.

**Kiến trúc:** loại đơn mới `HALF_SHIFT_LEAVE` đi qua đường nộp/duyệt có sẵn (`fileRequest` → `planClaims` → `day_status`). Dòng ngày công và phiếu lương nhận hệ số nửa công. Nợ không lưu: hàm thuần `allocateHalfShiftDebt` xếp giờ làm thêm thành "bù" hoặc "OT thật" lúc tính lương và lúc dựng form.

**Công nghệ:** NestJS + Kysely + PostgreSQL chạy thẳng bằng `tsx` (không có bước build); test dùng `node:test`.

**Spec (đọc trước khi làm):** `docs/superpowers/specs/2026-11-06-half-shift-leave-design.md`. Plan này chỉ nói *làm gì ở đâu*; số liệu, câu lỗi tiếng Việt và luật nằm ở spec. Khi plan và spec lệch nhau, spec thắng.

## Global Constraints

- **Chỉ làm trong worktree** `C:\Users\52.AI UD\Project\Vladilena-Milize\.claude\worktrees\half-shift-leave`, nhánh `claude/half-shift-leave` (tách từ `main` bcd5166). Không `checkout`/`merge`/`rebase` sang nhánh khác, không đụng `main`, **không push**, không force, không sửa worktree khác.
- **Chỉ hai lệnh xác minh:** `npm test` (ở gốc repo) và `npm --prefix web run test:ui -- --workers=2`. **Không chạy** `npm run typecheck`, `tsc`, prettier hay `format:check`; không thêm hai bước đó vào đâu cả.
- **Test PG:** các file `*.pg.test.ts` tự **bỏ qua** khi chưa đặt `PG_TEST_URL`. Bỏ qua **không phải** đạt. Đặt `PG_TEST_URL` trỏ vào control database của dịch vụ test (xem `docs/postgres-local.md`, cổng 55433, `luong_test_control`), không bao giờ trỏ vào DB dev. PowerShell: `$env:PG_TEST_URL="postgresql://luong_test:<mật khẩu>@127.0.0.1:55433/luong_test_control"`. Mọi lệnh test PG phải in `# skipped 0`.
- **Chạy một file test:** `node --import tsx --test test/v2/<tên>.test.ts`. Chạy cả bộ: `npm test`.
- **TDD bắt buộc:** không viết code production khi chưa có test đỏ. Test xanh ngay lần chạy đầu là test sai: sửa test.
- **Không đọc, không trích `spec/`** (thư mục luật v1 đã bỏ). Luật lấy từ spec nghỉ giữa ca ở trên. Nếu code, spec và tài liệu khác mâu thuẫn nhau, **dừng và hỏi**.
- **Lược đồ DB chỉ ở `migrations/postgres/schema.sql`** (một file, không tạo file đánh số) và `src/database/schema.ts`. Không có bản sao lưu DB: cứ sửa schema, DB dev/demo sẽ được tạo lại sau.
- **Mọi khoản tiền làm tròn đúng một lần** qua `moneyOf` (`src/modules/payroll/domain/money.ts`), một công thức trên đại lượng chưa làm tròn.
- **Câu lỗi tiếng Việt** đúng như spec mục 6.3 và 7.2. Không đặt mã lỗi mới; không thêm mã nhật ký mới (T7).
- **Commit sau mỗi task**, thông điệp dạng `feat(half-shift): …` hoặc `test(half-shift): …`. Chỉ `git add` đúng các file của task.
- **Sổ ghi** `docs/superpowers/plans/2026-11-06-half-shift-leave.progress.md`: dòng đầu `# Sổ — plan: docs/superpowers/plans/2026-11-06-half-shift-leave.md`; sau mỗi task thêm `Task N: xong (commit <mã>, test: <lệnh> → <kết quả>)`. Điều plan để mở mà bạn tự quyết: ghi `Ruling: <quyết định> — <lý do> — <rủi ro nếu sai>`, rồi làm tiếp.
- **Dừng và hỏi người dùng** chỉ khi: (1) thao tác không hoàn tác (xoá dữ liệu, ghi đè file không phải của task, đổi schema DB thật); (2) đụng khoá/token/`.env` thật; (3) tác động ngoài worktree (merge, push, deploy); (4) plan hỏng đến mức mọi hướng đều là đoán.
- **Không sửa test có sẵn cho xanh.** Chỉ sửa test cũ khi nó ghim đúng hành vi mà spec đổi (vd. `payUnits` chỉ 0|1, câu lỗi OT/nghỉ có làm bù); mỗi lần sửa ghi một `Ruling:`.
- **Không đụng `web/`** (FE không đổi trong tính năng này). `test:ui` chỉ để chắc FE mock không vỡ.

## Review Focus

Năm tình huống spec ngầm đòi mà dễ vỡ nhất; mỗi dòng đã có test ở task nêu:

1. **Khung OT cùng ngày nhưng TRƯỚC ca** (vd. Normal2 10–19, khung 06:00–09:00): spec mục 8 so ngày (`date ≤`), nên khung này **vẫn trả nợ**. Test ghim hành vi này ở Task 9. Đây là chỗ người dùng có thể muốn đổi.
2. **Ca đêm qua nửa đêm** (Night1 22:00–07:00, làm 22:00–02:00): dòng ngày so chấm công với khung nửa ca qua nửa đêm, không sinh trường hợp sai (Task 7).
3. **Công lẻ và ngưỡng chuyên cần:** 5 lần nghỉ giữa ca (2,5 ngày nghỉ) giữ chuyên cần, 6 lần (3 ngày) mất; tháng không có nghỉ giữa ca ra **đúng từng đồng** như trước (Task 8).
4. **Trần 12 giờ/ngày vẫn tính ca 8 giờ** cho ngày nửa ca (spec không nói; giữ nguyên hành vi hiện có, Task 11).
5. **Nộp lại sau từ chối/huỷ** trên cùng ngày được; **duyệt đơn của tháng đã tính lương** thì phiếu về nháp (Task 6).

## Quyết định của plan (ghi lại, cần người dùng biết)

- **P1 — Không thêm route `me` mới.** `POST /api/v2/me/requests/:kind` và `.../:kind/preview` là route tổng quát; chỉ thêm khoá `'half-shift-leave'` vào bảng `CREATE` của `me.controller.ts`. Route mới duy nhất là `POST /api/v2/requests/half-shift-leave` (Admin).
- **P2 — Hàm `leaveWindowOf`** suy nửa nghỉ từ nửa làm đã chụp (đơn chỉ lưu nửa làm, spec mục 5).
- **P3 — Nợ "đăng ký" của form** (`halfShiftDebt.registeredMinutes`) làm ở lát 3 cùng `allocateHalfShiftDebt`; lát 1 chỉ có `kinds`, `days[].halfShift`, `choices`, `rules`.

## Cấu trúc file

| File | Việc |
|---|---|
| `src/common/half-shift.ts` (mới) | Hàm thuần: `halvesOf`, `leaveWindowOf`, `allocateHalfShiftDebt`, hằng 240. Đơn từ, chấm công, lương cùng dùng. |
| `migrations/postgres/schema.sql`, `src/database/schema.ts` | Cột mới (spec mục 5). |
| `src/modules/requests/domain/{types,system-request,day-status,employee-days,filing-rules,filing-choices,request-context,request-dates}.ts` | Loại đơn, thực thể, ma trận ngày, tiêu đề, form. |
| `src/modules/requests/{requests.service,requests.repository,requests.controller}.ts` | Nộp, duyệt, huỷ, xem trước, lưu, route Admin. |
| `src/modules/me/me.controller.ts`, `me/domain/me-views.ts` | Bảng `CREATE`, cờ `halfShift`, tổng công. |
| `src/modules/attendance/domain/{attendance-day,daily-timesheet}.ts`, `attendance-days.repository.ts`, `attendance.repository.ts` | Dòng ngày nửa công. |
| `src/modules/payroll/domain/{employee-payslip,overtime-pay}.ts`, `payroll.service.ts`, `payroll.repository.ts` | Phiếu lương nửa công, bù/OT. |
| `src/modules/periods/domain/request-months.ts`, `periods.repository.ts`, `overview/domain/cells.ts`, `overview/overview.service.ts` | Kỳ lương, tổng quan. |
| `docs/api/v2-contract.md`, `docs/fe-yeu-cau/…` | Hợp đồng API, yêu cầu cho FE. |

---

# LÁT 1 — Đơn

### Task 1: `halvesOf` và `leaveWindowOf` (hàm thuần)

**Files:**
- Create: `src/common/half-shift.ts`
- Test: `test/v2/half-shift-halves.test.ts`

**Interfaces — Produces** (các task sau dùng đúng tên này):
```ts
export type HalfShift = 'FIRST' | 'SECOND';
export interface ClockRange { start: string; end: string }               // 'HH:mm'; end <= start nghĩa là qua nửa đêm
export interface HalfPair { work: ClockRange; leave: ClockRange }
export interface Halves { FIRST: HalfPair; SECOND: HalfPair }
export const HALF_SHIFT_OWED_MINUTES = 240;
export function halvesOf(shift: ClockRange): Halves | null;               // null khi ca không dài đúng 540 phút
export function leaveWindowOf(half: HalfShift, work: ClockRange): ClockRange; // nửa nghỉ suy từ nửa làm đã chụp
```

- [ ] **Step 1: Viết test đỏ** `half-shift-halves.test.ts`:
  - `halvesOf` của sáu ca (spec 4.1), mỗi ca một lần `assert.deepEqual`: Normal1 `{start:'08:00',end:'17:00'}` → FIRST làm 08:00–12:00 / nghỉ 13:00–17:00, SECOND làm 13:00–17:00 / nghỉ 08:00–12:00; Normal2 10–19 → 10–14|15–19; Flex1 06–15 → 06–10|11–15; Flex2 13–22 → 13–17|18–22; Night1 22–07 → FIRST làm 22:00–02:00 nghỉ 03:00–07:00, SECOND làm 03:00–07:00 nghỉ 22:00–02:00; Night2 21–06 → FIRST làm 21:00–01:00 nghỉ 02:00–06:00, SECOND làm 02:00–06:00 nghỉ 21:00–01:00.
  - Ca khác 9 giờ → `null`: `08:00–16:00`, `08:00–18:00`, `22:00–06:00`.
  - `leaveWindowOf('FIRST', {start:'08:00',end:'12:00'})` = `{start:'13:00',end:'17:00'}`; `leaveWindowOf('SECOND', {start:'13:00',end:'17:00'})` = `{start:'08:00',end:'12:00'}`; `leaveWindowOf('FIRST', {start:'22:00',end:'02:00'})` = `{start:'03:00',end:'07:00'}`.
- [ ] **Step 2: Chạy** `node --import tsx --test test/v2/half-shift-halves.test.ts`. **Expected:** FAIL, không tìm thấy module `src/common/half-shift`.
- [ ] **Step 3: Cài đặt** các hàm trên trong `src/common/half-shift.ts`. Tính theo phút trong ngày, chia lấy dư 1440 để qua nửa đêm; độ dài ca = `(end − start + 1440) % 1440` (0 coi là 1440, nên không bao giờ bằng 540). Định dạng lại thành `HH:mm`.
- [ ] **Step 4: Chạy lại.** **Expected:** `# fail 0`.
- [ ] **Step 5: Commit** `git add src/common/half-shift.ts test/v2/half-shift-halves.test.ts` → `feat(half-shift): hai nửa của ca`.

### Task 2: Lược đồ, thực thể đơn, lưu trữ

**Files:**
- Modify: `migrations/postgres/schema.sql` (`system_requests` ~305–336; `timesheet_entries` ~369–408; `day_status` ~461–473), `src/database/schema.ts` (~40–48 và ~404–470)
- Modify: `src/modules/requests/domain/types.ts`, `src/modules/requests/domain/system-request.ts`, `src/modules/requests/requests.repository.ts` (`upsertRequest` ~158–185, `selectRequests` ~191–224)
- Test: `test/v2/half-shift-request.test.ts` (thuần), `test/v2/half-shift-repository.pg.test.ts`

**Interfaces — Consumes:** Task 1. **Produces:**
```ts
// RequestType thêm 'HALF_SHIFT_LEAVE'; trạng thái giữ ngày (DayStatus status) thêm 'HALF_SHIFT'
SystemRequest.createHalfShiftLeave(p: {
  employeeId: string; title: string; reason: string;
  halfShiftDate: string; halfShift: HalfShift; halfStart: string; halfEnd: string;
}): SystemRequest          // type 'HALF_SHIFT_LEAVE', status 'PENDING'
// thuộc tính: halfShiftDate, halfShift, halfStartTime, halfEndTime
// DTO (toJSON/toDTO) thêm: halfShiftDate, halfShift, halfShiftWork {start,end}|null, halfShiftLeave {start,end}|null,
// owedMinutes = 240 cho loại này, dates = [halfShiftDate]
```

- [ ] **Step 1: Viết test đỏ.**
  - `half-shift-request.test.ts`: `createHalfShiftLeave({... halfShiftDate:'2026-11-12', halfShift:'FIRST', halfStart:'08:00', halfEnd:'12:00'})` cho `type === 'HALF_SHIFT_LEAVE'`, `status === 'PENDING'`; DTO có `halfShiftWork` `{start:'08:00',end:'12:00'}`, `halfShiftLeave` `{start:'13:00',end:'17:00'}`, `owedMinutes === 240`, `dates` `['2026-11-12']`; đơn loại khác có `halfShiftDate/halfShift/halfShiftWork/halfShiftLeave` đều `null`. Giá trị `half` ngoài `FIRST|SECOND` → ném lỗi "Nửa ca không hợp lệ: …".
  - `half-shift-repository.pg.test.ts` (dùng `withTempDb` trong `test/v2/helpers/pg-temp-db.ts`): lưu đơn rồi đọc lại bằng repository ra đúng bốn cột; `INSERT` thẳng `day_status.status = 'HALF_SHIFT'` được; `half_shift_half = 'MIDDLE'` bị CHECK từ chối; `timesheet_entries.pay_units = 0.5` ghi được, `0.7` bị CHECK từ chối, `half_shift = 'FIRST'` ghi được.
- [ ] **Step 2: Chạy** hai file. **Expected:** FAIL (thiếu factory/cột).
- [ ] **Step 3: Sửa schema** theo spec mục 5: `system_requests.type` CHECK thêm `'HALF_SHIFT_LEAVE'`, cột `half_shift_date DATE`, `half_shift_half TEXT CHECK (… IN ('FIRST','SECOND'))`, `half_start_time TEXT`, `half_end_time TEXT`; `day_status.status` CHECK thêm `'HALF_SHIFT'`; `timesheet_entries.half_shift` (cùng CHECK) và `pay_units` cho phép `0, 0.5, 1` (**đọc kiểu cột và CHECK hiện có trước**, giữ kiểu số thực). Cập nhật `schema.ts` tương ứng. Không tạo file migration mới.
- [ ] **Step 4: Cài đặt** thực thể, DTO, và hai chỗ ánh xạ ở `requests.repository.ts` (ghi và đọc `half_shift_date` dưới dạng chuỗi `YYYY-MM-DD`, như cách `isat.saturday` hay `ot_date` đang được đọc).
- [ ] **Step 5: Chạy** hai file với `PG_TEST_URL` đặt. **Expected:** `# fail 0`, `# skipped 0`.
- [ ] **Step 6: Commit** `feat(half-shift): lược đồ và thực thể đơn nghỉ giữa ca`.

### Task 3: Ma trận ngày (`day-status`)

**Files:**
- Modify: `src/modules/requests/domain/day-status.ts` (`planDay` ~101, `planClaims` ~175), `src/modules/requests/domain/employee-days.ts` (`shiftChangeOn` ~102)
- Test: `test/v2/half-shift-day-status.test.ts` (thuần; mẫu: `requests-day-status.test.ts`, `day-status-plan.test.ts`)

**Interfaces — Consumes:** Task 2 (`'HALF_SHIFT'`). **Produces:** `planClaims` nhận `kind: 'HALF_SHIFT_LEAVE'` (một ngày) và áp ma trận spec 7.2 theo cả hai hướng (nộp nửa ca lên ngày đang giữ; nộp loại khác lên ngày có dòng `HALF_SHIFT`); `EmployeeDays.shiftChangeOn(date)` đọc cả dòng `HALF_SHIFT` có `baseRequestId`.

- [ ] **Step 1: Viết test đỏ**, mỗi ô của bảng 7.2 một test, xác nhận bằng chính cách các test hiện có đọc kết quả `planClaims`: ngày trống → nhận; `LEAVE`/`LEAVE_WITH_MAKEUP` → ném `DayConflictError` "Ngày dd/mm đã có đơn nghỉ"; `SHIFT_CHANGE` → nhận và **thay** dòng đổi ca (kết quả mang `base_request_id` là đơn đổi ca); `ISAT` chờ → chặn "huỷ đơn iSAT hoặc chọn ngày khác", `ISAT` đã duyệt → chặn "không chọn được ngày này"; `HALF_SHIFT` → chặn "Ngày dd/mm đã có đơn nghỉ giữa ca". Hướng ngược lại: nộp nghỉ / nghỉ có làm bù / iSAT lên ngày `HALF_SHIFT` → chặn với câu trong cột phải; đổi ca → **bỏ ngày đó** kèm cảnh báo "Ngày dd/mm đã có đơn nghỉ giữa ca, giữ nguyên, không đổi ca."; OT, khung bù, giải trình → nhận, không đổi gì. Thêm: `shiftChangeOn` trả đơn đổi ca khi ngày có dòng `HALF_SHIFT` mang `baseRequestId`.
- [ ] **Step 2: Chạy.** **Expected:** FAIL.
- [ ] **Step 3: Cài đặt** theo cách `ISAT`/`LEAVE` đang xử lý dòng `SHIFT_CHANGE` bằng `base_request_id`; không thêm cơ chế mới.
- [ ] **Step 4: Chạy lại cùng file và `test/v2/requests-day-status.test.ts`, `test/v2/day-status-plan.test.ts`.** **Expected:** `# fail 0`.
- [ ] **Step 5: Commit** `feat(half-shift): ma trận ngày cho nghỉ giữa ca`.

### Task 4: Nộp đơn, xem trước, tiêu đề

**Files:**
- Modify: `src/modules/requests/requests.service.ts` (`FilingKind` :76; `CLAIMING_TYPES` :106; `recheckScope` :112; `standsBeside` :139; `datesOf` :497; `inputDates` :524; `filingMonths` :630; `createLeaveWithMakeupRequest` :684 làm mẫu; `planFiling` :766; `planLeave` :786 làm mẫu), `src/modules/requests/domain/filing-rules.ts` (`requestTitle`/`TitleInput` ~68–110), `src/modules/requests/domain/request-dates.ts` (`requestDates`)
- Test: `test/v2/half-shift-filing.test.ts` (dùng `makeService`, `staffContext`, `seed`… trong `test/v2/helpers/requests-fakes.ts`; mẫu: `requests-leave.test.ts`), `test/v2/half-shift-filing.pg.test.ts`

**Interfaces — Consumes:** Task 1–3. **Produces:**
```ts
// FilingKind thêm 'half-shift-leave'
RequestsService.createHalfShiftLeaveRequest(
  input: { employeeId: string; reason: string; date: string; half: string; title?: string },
  opts?: FilingOptions
): Promise<CreatedRequestDTO>
// previewRequest('half-shift-leave', …) cho summary: { date, half, work: ClockRange, leave: ClockRange, owedMinutes: 240 }
// requestTitle({ kind: 'half-shift-leave', date, work }) → 'Nghỉ giữa ca 12/11, làm 08–12h'
```

- [ ] **Step 1: Viết test đỏ** (`half-shift-filing.test.ts`, bằng fake) đúng thứ tự kiểm của spec 7.1:
  1. Tháng đã chốt → `PERIOD_LOCKED` **trước mọi luật khác** (kể cả khi `half` sai).
  2. `date` sai định dạng, `half` ngoài `FIRST|SECOND`, `reason` rỗng → lỗi dữ liệu vào.
  3. Tự nộp (`filedBy:'self'`): ngày trước hôm nay hoặc sau cuối tháng sau → từ chối; Admin nộp thay cùng ngày đó → nhận.
  4. Nhân sự không tồn tại; chưa vào làm/đã nghỉ việc → `NOT_EMPLOYED`; thiếu cấu hình loại nhân sự → "Thiếu cấu hình loại nhân sự …".
  5. Thiếu quyền lợi `ot` **hoặc** `makeup` (`tts`) → "Loại nhân sự này không dùng được nghỉ giữa ca"; `nv`, `ctv` → qua.
  6. Chủ nhật, ngày lễ, ngày ngoài tuần làm → "Ngày dd/mm không phải ngày làm việc"; ca của ngày dài 8 giờ → "Ca của ngày dd/mm không chia được thành hai nửa 4 giờ".
  7. Trùng: đơn nghỉ, nghỉ có làm bù, iSAT, nửa ca khác (kể cả đơn **chờ**) → bị chặn; khung OT và khung bù có sẵn trong ngày **không** chặn; không giới hạn số lần trong tháng (nộp ba ngày khác nhau đều nhận).
  8. Ngày đã có đơn đổi ca (Flex1) → hai nửa tính theo ca đã đổi (`halfShiftWork` của FIRST = 06:00–10:00).
  9. Nhận được: đơn `PENDING`, `title` = `Nghỉ giữa ca 12/11, làm 08–12h` (bỏ qua `title` client gửi), `dates` `['2026-11-12']`, `owedMinutes` 240, một lần `claimDays` với `status: 'HALF_SHIFT'`.
  10. Xem trước: cùng kiểm tra, trả `{ ok:true, title, summary }` không ghi gì; lỗi nghiệp vụ → `ok:false`.
  `half-shift-filing.pg.test.ts`: nộp thật trên PG: lần 1 nhận, lần 2 cùng ngày bị `DayConflictError`; ngày có đơn đổi ca đã duyệt → nộp nửa ca **thay** dòng đổi ca (`day_status.base_request_id` = đơn đổi ca).
- [ ] **Step 2: Chạy** cả hai. **Expected:** FAIL.
- [ ] **Step 3: Cài đặt** `planHalfShift(input, opts): Promise<Filing>` theo khung của `planLeave` (`assertSelfFiling`, `resolveStaff`, `assertEmployed`, `requireTypeConfig`, rồi trong khoá `loadDays` + `planClaims`), thêm vào `planFiling`, `CLAIMING_TYPES`, `recheckScope`, `standsBeside` (nửa ca đứng cạnh nghỉ/nghỉ có làm bù/iSAT/đổi ca như các loại giữ ngày), `datesOf`/`inputDates`/`filingMonths`/`requestDates` (`[halfShiftDate]`). Nửa làm lấy từ `halvesOf(ca của ngày)[half].work`, **chụp** vào đơn (`halfStart/halfEnd`).
- [ ] **Step 4: Chạy lại** hai file + `requests-leave.test.ts`, `requests-preview.test.ts`, `requests-makeup.test.ts`. **Expected:** `# fail 0`, `# skipped 0` với file PG.
- [ ] **Step 5: Commit** `feat(half-shift): nộp và xem trước đơn nghỉ giữa ca`.

### Task 5: Route và `request-context`

**Files:**
- Modify: `src/modules/requests/requests.controller.ts` (thêm `@Post('half-shift-leave')` sau `@Post('isat')` :139), `src/modules/me/me.controller.ts` (bảng `CREATE` :67–75; **không** thêm route), `src/modules/requests/domain/{request-context,filing-choices}.ts`, `requests.service.ts` (`requestContext` kinds ~575–590)
- Test: `test/v2/half-shift-routes.test.ts` (mẫu: `me-controller.test.ts`, `requests-self-filing.test.ts`), `test/v2/half-shift-choices.test.ts` (thuần), `test/v2/half-shift-context.pg.test.ts`

**Interfaces — Consumes:** Task 4. **Produces:** `POST /api/v2/requests/half-shift-leave` (201); `POST /api/v2/me/requests/half-shift-leave` và `.../preview` qua bảng `CREATE`; `request-context` thêm `kinds[]` phần tử `{kind:'half-shift-leave', enabled, reason?}`, `days[].halfShift`, `choices['half-shift-leave'].dates`, `rules.halfShiftOwedMinutes: 240` (spec 6.2, trừ `months[].halfShiftDebt` và nghĩa mới của `hasOvertime`: Task 11).

- [ ] **Step 1: Viết test đỏ.**
  - Routes: Admin POST trả 201 và thân như `createdBody`; xung đột ngày → mã/HTTP đúng như loại khác (dùng `dayConflictHttp`); `me` POST `half-shift-leave` dùng `filedBy:'self'` (ngoài khoảng ngày bị từ chối); `me` preview trả 200 `ok:false` cho lỗi nghiệp vụ; `isat` vẫn 404 ở preview.
  - Context (PG): `nv` thấy `kinds` có `half-shift-leave` `enabled:true`; `tts` thấy `enabled:false` kèm "Loại nhân sự này chưa dùng được nghỉ giữa ca" (T9); mọi tháng đã chốt → `enabled:false` "Không còn ngày đăng ký được"; `days[]` của ngày làm việc 08–17 có `halfShift = { FIRST:{work:{08:00,12:00},leave:{13:00,17:00}}, SECOND:{…} }`; ngày có đơn nghỉ, ngày Chủ nhật, ngày lễ, ngày ca 8 giờ, ngày tháng đã chốt → `halfShift: null`; ngày có đơn nửa ca → trạng thái giữ ngày hiện `HALF_SHIFT` và `halfShift: null`; `choices['half-shift-leave'].dates` đúng các ngày `halfShift` khác null; `rules.halfShiftOwedMinutes === 240`. `countsAsLeave`/`leaveEnds` trong `filing-choices.ts`: dòng `HALF_SHIFT` **không** tính là nghỉ và **cắt** đoạn nghỉ liên tiếp (test thuần riêng `test/v2/half-shift-choices.test.ts`).
- [ ] **Step 2: Chạy.** **Expected:** FAIL.
- [ ] **Step 3: Cài đặt** như mô tả; `request-context` dùng `halvesOf` trên ca của từng ngày (đã tính đổi ca).
- [ ] **Step 4: Chạy lại** các file mới + `me-controller.test.ts`, `requests-context.test.ts`, `requests-filing-context.test.ts`. **Expected:** `# fail 0`.
- [ ] **Step 5: Commit** `feat(half-shift): route và request-context cho nghỉ giữa ca`.

### Task 6: Duyệt, từ chối, huỷ, ngày lễ, kỳ lương, tổng quan

**Files:**
- Modify: `src/modules/requests/requests.service.ts` (`decide` :1389; `cancelRequest` :1471; `dropHolidayDays` :1574; `giveBack` :1603; `recheck`), `src/modules/periods/domain/request-months.ts` (`RequestDates` thêm `halfShiftDate`), `src/modules/periods/periods.repository.ts` (`blockers` ~89–108: `day()` mở rộng cho `half_shift_date`), `src/modules/payroll/payroll.repository.ts` (~158 ánh xạ đơn; ~383–390 điều kiện đơn đã duyệt), `src/modules/overview/domain/cells.ts` (:202–219)
- Test: `test/v2/half-shift-review.pg.test.ts`, `test/v2/half-shift-periods.test.ts` (thuần: `requestMonths`, nhóm/nhãn của tổng quan)

**Interfaces — Consumes:** Task 4–5. **Produces:** đơn nửa ca đi hết vòng đời; `requestMonths({halfShiftDate})` → tháng của ngày đó; `GROUP_OF_TYPE.HALF_SHIFT_LEAVE = 'leave'`, `WHAT_OF_TYPE.HALF_SHIFT_LEAVE = 'Nghỉ giữa ca'`.

- [ ] **Step 1: Viết test đỏ.**
  - PG: duyệt → `APPROVED`, `day_status` vẫn giữ ngày (`HALF_SHIFT`), lịch làm việc của ngày **không** bị đánh dấu nghỉ (`markLeaveDays` không áp cho đơn nửa ca); từ chối/huỷ (chỉ khi còn chờ) → ngày được trả, và **nộp lại cùng ngày được**; huỷ đơn đã duyệt bị từ chối; từ chối/huỷ khi ngày đang đè lên đơn đổi ca → trả lại dòng đổi ca (ghi lại lịch nếu đơn đổi ca đã duyệt); thêm ngày lễ vào ngày của đơn **chờ** → duyệt ném lỗi xung đột "Ngày dd/mm đã thành ngày lễ, đơn nghỉ giữa ca không duyệt được. Chỉ có thể từ chối đơn này." còn từ chối vẫn được; tháng đã tính lương rồi duyệt/huỷ → phiếu của tháng về nháp (như đơn nghỉ); nhật ký ghi `request.decide` / `request.cancel` (không mã mới). Dòng ngày công của ngày đơn được dựng lại sau duyệt (gọi `rewriteDays` đúng ngày đó).
  - Thuần: `requestMonths({halfShiftDate:'2026-12-01'})` = `['2026-12']`; ô tổng quan ra nhóm `leave`, nhãn "Nghỉ giữa ca".
  - SQL chặn chốt kỳ: đơn nửa ca **chờ** có `half_shift_date` trong tháng làm `pendingRequests` tăng 1 (PG).
- [ ] **Step 2: Chạy.** **Expected:** FAIL.
- [ ] **Step 3: Cài đặt** như mô tả (spec 11). `payroll.repository.ts` phải lấy đơn `APPROVED` có `half_shift_date` trong tháng và ánh xạ bốn trường mới vào đối tượng đơn mà `payroll.service.ts` đọc.
- [ ] **Step 4: Chạy lại** các file mới + `requests-review.test.ts`, `requests-review.pg.test.ts`, `overview-cells.test.ts`, `payroll-period.pg.test.ts`. **Expected:** `# fail 0`, `# skipped 0`.
- [ ] **Step 5: Chạy cả bộ** `npm test`. **Expected:** `# fail 0` (ghi số `pass`/`skipped` vào sổ).
- [ ] **Step 6: Commit** `feat(half-shift): duyệt, huỷ, ngày lễ, kỳ lương, tổng quan` — **hết lát 1.**

---

# LÁT 2 — Ngày công và lương

### Task 7: Dòng ngày công nửa công

**Files:**
- Modify: `src/modules/attendance/domain/attendance-day.ts` (`payUnits` :100, khởi tạo :203, `buildDay` bước 5 ~336–370), `src/modules/attendance/domain/explanation-detect.ts` (`windowSpans`, `expectedBounds`, `detectCases`), `src/modules/attendance/attendance-days.repository.ts` (`upsertDays` :90–117, `loadSources` :129, ánh xạ :440–473, `valuesOf` :477–512), `src/modules/attendance/attendance.repository.ts` (:49), `src/modules/attendance/domain/daily-timesheet.ts` (:18, :92, :121, :150, :262, :323, :358, :401, :432), `src/modules/me/me.controller.ts` (`GET today` ~:174 và `GET attendance`: thêm cờ `halfShift` vào DTO, spec mục 9)
- Test: `test/v2/half-shift-day-row.test.ts` (thuần; mẫu: `attendance-day.test.ts`), `test/v2/half-shift-day-row.pg.test.ts` (mẫu: `attendance-days-sources.pg.test.ts`), `test/v2/half-shift-me.pg.test.ts` (mẫu: `me-attendance.pg.test.ts`)

**Interfaces — Consumes:** Task 1, 2, 6. **Produces:**
```ts
// AttendanceDay: payUnits: 0 | 0.5 | 1;  halfShift: HalfShift | null
// DayFacts.halfShift: { half: HalfShift; start: string; end: string; requestId: string } | null
//   (đọc từ đơn HALF_SHIFT_LEAVE đã duyệt của ngày, trong attendance-days.repository.ts cạnh phần tải khung OT)
// DailyTimesheet (DTO dòng ngày): payUnits: number (0|0.5|1), halfShift: HalfShift | null
```

- [ ] **Step 1: Viết test đỏ** (`half-shift-day-row.test.ts`, spec mục 9), ca Normal1 và đơn `FIRST` làm 08:00–12:00:
  - Vào 08:00 ra 12:00 → `status 'PRESENT'`, `shift.start '08:00'`, `shift.end '12:00'`, loại ca/phụ cấp lấy từ ca của ngày, `halfShift 'FIRST'`, `workHours 4`, `payUnits 0.5`, `countsAsWorkday true`, `countsAsDayOff true`.
  - **Quy tắc gốc:** chỗ nào code hiện cho `payUnits = 1`, ngày nửa ca cho `0.5` (kể cả sau giải trình đã duyệt); chỗ nào hiện cho 0 (có trường hợp ảnh hưởng tiền chưa giải trình) thì vẫn 0.
  - Ở lại tới 15:00 → trường hợp "ra muộn" 180 phút cần giải trình, `workHours 4` (chỉ tính trong khung), không sinh OT.
  - Vào 08:40 → vào trễ tính theo 08:00 của khung; ra 11:20 → ra sớm tính theo 12:00.
  - Ngày được xét từ **12:30** (30 phút sau cuối khung): với "bây giờ" đặt 12:20 (cách các test hiện có đặt giờ hiện tại) dòng còn `PENDING`; đặt 12:31 thì là `PRESENT`/`ABSENT`.
  - Không chấm công, quá giờ xét → `ABSENT`: `payUnits 0`, `countsAsDayOff true`, `halfShift` vẫn ghi (T4).
  - Ngày lễ / lịch nghỉ đã duyệt / ngoài tuần làm vẫn thắng nửa ca (các bước đầu của `buildDay` không đổi).
  - **Ca đêm:** Night1 đơn `FIRST` (22:00–02:00): vào 22:00 hôm trước, ra 02:05 hôm sau → không sinh trường hợp; ra 02:40 → ra muộn; `SECOND` làm 03:00–07:00 hoạt động tương tự.
  - PG: ghi dòng rồi đọc lại giữ `half_shift 'FIRST'` và `pay_units 0.5`; `work_units` bằng `pay_units`; dòng ngày không có đơn nửa ca ra y như trước (chạy lại một case sẵn có để chắc).
  - `half-shift-me.pg.test.ts`: ngày có đơn nửa ca đã duyệt → `GET /api/v2/me/today` (`shift` là khung 08:00–12:00 và có `halfShift: 'FIRST'`) và `GET /api/v2/me/attendance` (ô ngày có `halfShift`); ngày thường `halfShift: null`.
- [ ] **Step 2: Chạy.** **Expected:** FAIL.
- [ ] **Step 3: Cài đặt:** `buildDay` nhánh ngày làm: khi `facts.halfShift` khác null, thay giờ của `row.shift` bằng khung nửa làm (giữ loại ca và phụ cấp), đặt `row.halfShift`, dùng khung đó cho `detectCases`/giờ xét/`workHours` (giao của khoảng vào–ra với khung), và `payUnits` 1 → 0,5, `countsAsWorkday = payUnits > 0` (hiện `=== 1` ở :369), `countsAsDayOff = true` cho `PRESENT`. Ánh xạ đọc ở :463 (`Number(row.pay_units) === 1 ? 1 : 0`) đổi để giữ 0,5. Thêm cột `half_shift` vào `upsertDays`, `valuesOf`, ánh xạ đọc và `attendance.repository.ts`.
- [ ] **Step 4: Chạy lại** hai file mới + `attendance-day.test.ts`, `attendance-days-repository.pg.test.ts`, `attendance-days-sources.pg.test.ts`, `attendance-makeup-credit.test.ts`. **Expected:** `# fail 0`.
- [ ] **Step 5: Commit** `feat(half-shift): dòng ngày công nửa công`.

### Task 8: Phiếu lương theo nửa công, tổng công, tạm ứng

**Files:**
- Modify: `src/modules/payroll/domain/employee-payslip.ts` (`DailyAttendanceLineProps` ~:44; vòng đếm :344–385; miễn thuế đêm :358/:372/:498), `src/modules/payroll/payroll.service.ts` (vòng dòng ngày :533–614), `src/modules/me/domain/me-views.ts` (:141), `src/modules/overview/overview.service.ts` (~:224)
- Test: `test/v2/half-shift-payroll.test.ts` (mẫu: `payroll-makeup-no-allowance.test.ts` với `payroll-fixtures.ts`: `dayRow`, `nvMonthData`, `FakeDays`), thêm ca vào `test/v2/payroll-advance-quote.test.ts` nếu hợp, `test/v2/me-domain.test.ts`, `test/v2/overview-cells.test.ts`

**Interfaces — Consumes:** Task 7. **Produces:**
```ts
// DailyAttendanceLineProps thêm: halfShift: HalfShift | null; repaidMinutes: number  (repaid dùng ở Task 10; mặc định 0)
// Trọng số dòng w = (kind === 'PRESENT' && halfShift !== null) ? 0.5 : 1
// EmployeePayslip: actualWorkDays / paid days có thể là số lẻ (12.5)
```

- [ ] **Step 1: Viết test đỏ** (lương cơ bản 6.000.000, công chuẩn 26; **số tiền phụ cấp lấy tỉ lệ thật của fixture**, ghi công thức trong chú thích test, không chép số của spec 4.2 nếu tỉ lệ fixture khác):
  - Một dòng `PRESENT` nửa ca: `actualWorkDays === 0.5`, `baseSalaryActual === 115_385`; đi lại = `round(6.000.000 × travelRate × 0,5 ÷ 26)`; chuyên cần (khi giữ) = `round(6.000.000 × attendanceRate × 0,5 ÷ 26)`.
  - Ca Flex 4 giờ: phụ cấp linh hoạt = `round(6.000.000 × flexRate × 4 ÷ (26 × 8))` (công thức không đổi, chỉ theo giờ); ca Night: số ca đêm 0,5, phụ cấp đêm = `round(6.000.000 × nightRate × 0,5 ÷ 26)`, **tiền nghỉ giữa đêm = 0**, trần miễn thuế đêm dùng `8 × nightRate × 0,5`.
  - Chuyên cần: 5 dòng nửa ca (2,5 ngày nghỉ) giữ phụ cấp chuyên cần; 6 dòng (3 ngày) mất; 2 nửa ca + 1 ngày nghỉ phép không lương (3 ngày) mất. Nửa ca **không** vào `makeupShortfallDays`.
  - Dòng `ABSENT` có `halfShift`: trọng số 1 cho ngày nghỉ (T4).
  - Tháng **không** có dòng nửa ca: toàn bộ DTO phiếu bằng đúng kết quả của cùng fixture ở commit trước (so sánh `deepEqual` các trường tiền chính: `baseSalaryActual, totalAllowanceActual, grossIncome, netIncome`).
  - `advance-quote`: dòng `payUnits 0.5` vào `Σ payUnits` (không sửa code, chỉ test: 5 ngày 1 + 1 ngày 0,5 = 5,5 ngày).
  - `me-views.monthOf`: `totals.workDays` cộng trọng số (11 ngày thường + 1 nửa ca = 11,5); `overview.service` tương tự.
- [ ] **Step 2: Chạy.** **Expected:** FAIL.
- [ ] **Step 3: Cài đặt:** `workDaysCount += w` mỗi dòng `countsAsWorkday`; `dayOffCount += w` mỗi dòng `countsAsDayOff`; `flexCount/nightCount += w`; nightBreak bằng 0 và trần miễn thuế nhân `w` cho dòng nửa ca. `payroll.service.ts` truyền `halfShift` và `repaidMinutes: 0` vào dòng; `daySalary = round(payUnits × dayRate)` đã đúng với 0,5.
- [ ] **Step 4: Chạy lại** file mới + `payroll-*.test.ts` (cả nhóm), `me-domain.test.ts`, `overview-cells.test.ts`. **Expected:** `# fail 0`.
- [ ] **Step 5: Chạy cả bộ** `npm test` rồi `npm --prefix web run test:ui -- --workers=2`. **Expected:** cả hai `fail 0`.
- [ ] **Step 6: Commit** `feat(half-shift): phiếu lương, tổng công và tạm ứng theo nửa công` — **hết lát 2.**

---

# LÁT 3 — Nợ

### Task 9: `allocateHalfShiftDebt` (hàm thuần)

**Files:**
- Modify: `src/common/half-shift.ts`
- Test: `test/v2/half-shift-debt.test.ts`

**Interfaces — Produces** (Task 10, 11 dùng):
```ts
export interface DebtEvent { date: string; minutes: number }                 // 240 mỗi đơn đã duyệt
export interface WorkPiece { date: string; start: string; minutes: number }  // một khung OT
export interface PieceSplit { repaid: number; ot: number }                   // repaid + ot = minutes
export function allocateHalfShiftDebt(events: readonly DebtEvent[], pieces: readonly WorkPiece[]): PieceSplit[]
// kết quả cùng thứ tự `pieces` đầu vào; xét theo (date, start) tăng dần; nợ khả dụng của piece = Σ minutes của
// events có date <= piece.date, trừ phần đã trả trước đó
```

- [ ] **Step 1: Viết test đỏ** (mọi `date` cùng tháng 11/2026):
  - nợ 240 ngày 12/11; piece 13/11 `18:00` 240 phút → `[{repaid:240,ot:0}]`.
  - nợ 240 (12/11); 13/11 `18:00` 180 và 16/11 `18:00` 180 → `[{180,0},{60,120}]`.
  - chỉ piece 16/11 180 → `[{180,0}]` (60 còn lại không ở trong kết quả: người gọi tự trừ).
  - piece 10/11 120 (trước ngày nợ) → `[{0,120}]`.
  - piece cùng ngày 12/11 `18:00` 120 (sau ca) → `{120,0}`; piece cùng ngày `06:00` 120 → `{120,0}` (ghim hành vi "so ngày", Review Focus 1; ghi chú trong test).
  - hai nợ 12/11 và 13/11 (480 phút); piece 14/11 300 → `{300,0}`; piece 17/11 240 → `{180,60}`.
  - piece đưa vào lộn thứ tự (16/11 trước 13/11) → kết quả vẫn **theo thứ tự đầu vào** nhưng nợ trừ theo thứ tự ngày.
  - hai piece cùng ngày, `start` khác nhau: piece có `start` sớm hơn trả nợ trước.
  - piece 0 phút → `{0,0}`; không có nợ → mọi piece `ot = minutes`.
  - mọi kết quả: `repaid + ot === minutes`, `repaid >= 0`.
- [ ] **Step 2: Chạy.** **Expected:** FAIL (chưa export hàm).
- [ ] **Step 3: Cài đặt** thuật toán trên: sắp xếp chỉ mục piece theo (date, start, chỉ mục) rồi cuốn chiếu; không có trạng thái toàn cục.
- [ ] **Step 4: Chạy lại.** **Expected:** `# fail 0`.
- [ ] **Step 5: Commit** `feat(half-shift): xếp giờ làm thêm thành bù hoặc OT`.

### Task 10: Phiếu lương — bù và OT thật

**Files:**
- Modify: `src/modules/payroll/domain/overtime-pay.ts` (`OtShare` thêm `start: string`; `measureOvertime` gán `start: window.start`), `src/modules/payroll/payroll.service.ts` (sau :523 `measureOvertime`; :617 `otHoursByRate`; vòng dòng :575–579), `src/modules/payroll/domain/employee-payslip.ts` (props, DTO, `grossIncome` ~:470), `src/modules/payroll/payroll.repository.ts` nếu cần thêm dữ liệu
- Test: `test/v2/half-shift-payroll.test.ts` (thêm `describe`), `test/v2/payroll-overtime.test.ts` (chỉ nếu `OtShare` có test ghim hình dạng), `test/v2/half-shift-payroll.pg.test.ts`

**Interfaces — Consumes:** Task 8, 9. **Produces:**
```ts
// EmployeePayslip / DTO thêm: halfShiftOwedMinutes, halfShiftRepaidMinutes, halfShiftDroppedMinutes, halfShiftRepaidPay
// halfShiftRepaidPay = moneyOf(base, std, repaidMinutes / 60, { perHour: true })   // ×1, không phụ cấp, không hệ số
// dòng ngày: repaidMinutes; otHours của dòng chỉ là phần OT thật
```

- [ ] **Step 1: Viết test đỏ** (lương 6.000.000, công chuẩn 26, tháng 11/2026):
  - Nợ 240 (nửa ca duyệt 12/11); thứ 6 13/11 có mặt đủ trong khung 3 giờ, thứ 2 16/11 có mặt đủ trong khung 3 giờ → `halfShiftRepaidMinutes 240`, `halfShiftRepaidPay 115_385`, ot weekday `2` giờ (`ot15Hours 2`, `ot15Pay 86_538`), `totalOtHours 2`, `halfShiftDroppedMinutes 0`; dòng 13/11 `repaidMinutes 180`, dòng 16/11 `repaidMinutes 60`.
  - Chỉ thứ 2 làm 3 giờ → `halfShiftRepaidMinutes 180`, `halfShiftRepaidPay 86_538`, `halfShiftDroppedMinutes 60`, `ot15Hours 0`.
  - Không có nợ → mọi thứ như cũ, `halfShiftRepaidPay 0`, `halfShiftOwedMinutes 0`.
  - T4: dòng ngày 12/11 là `ABSENT` → nợ 0, giờ làm thêm là OT thật hết.
  - T8: 12/11 là ngày lễ → nợ 0.
  - `halfShiftRepaidPay` nằm trong `grossIncome` (gross tăng đúng 115_385 so với cùng tháng không có bù, các khoản khác như nhau) và **không** vào `totalAllowanceActual`, `makeupPay`, `makeupShortfallDays`, `taxExemptIncome`.
  - Giờ bù không có mặt (khung đã duyệt nhưng không chấm công) → không trả nợ.
  - PG (`half-shift-payroll.pg.test.ts`): cả tháng từ DB (nửa ca duyệt + hai khung OT + chấm công); đổi chấm công rồi tính lại → số đổi theo; duyệt đơn nửa ca của tháng đã tính → phiếu về nháp.
- [ ] **Step 2: Chạy.** **Expected:** FAIL.
- [ ] **Step 3: Cài đặt** trong `payslipOf`: `events` = đơn `HALF_SHIFT_LEAVE` đã duyệt có `halfShiftDate` trong tháng, bỏ ngày lễ (`data.holidayDates`) và ngày mà dòng ngày là `ABSENT`; `pieces` = `otShares` (`date: otDate`, `start`, `minutes: Math.round(hours × 60)`); gọi `allocateHalfShiftDebt`; mỗi share chỉ giữ phần `ot` làm giờ OT (giảm `hours` theo `ot/60`), phần `repaid` cộng vào `repaidMinutes` của dòng (`lineDate`) và tổng. `halfShiftOwedMinutes` = Σ events sau khi bỏ; `halfShiftDroppedMinutes` = owed − repaid.
- [ ] **Step 4: Chạy lại** `half-shift-payroll*.test.ts` + `payroll-*.test.ts`, `audit-payroll.pg.test.ts`. **Expected:** `# fail 0`, `# skipped 0` với file PG.
- [ ] **Step 5: Commit** `feat(half-shift): bù và OT thật trên phiếu lương`.

### Task 11: Form (nợ đăng ký), tháng có nghỉ có làm bù, trần OT

**Files:**
- Modify: `src/modules/requests/requests.service.ts` (`requestContext` months; `planMakeup` loại trừ OT ~:997; `planOvertime` loại trừ nghỉ có làm bù ~:1098; trần 12 giờ/40 giờ), `src/modules/requests/domain/{request-context,time-window}.ts` nếu cần
- Test: `test/v2/half-shift-context.pg.test.ts` (thêm), `test/v2/half-shift-lwm-month.pg.test.ts`, `test/v2/half-shift-limits.pg.test.ts`

**Interfaces — Consumes:** Task 9. **Produces:** `months[].halfShiftDebt: { owedMinutes, registeredMinutes, remainingMinutes }`, `months[].hasOvertime` = có OT thật, và lỗi theo spec 7.3.

- [ ] **Step 1: Viết test đỏ.**
  - Context: tháng có 2 đơn nửa ca đã duyệt + 1 chờ → `owedMinutes 480` (đơn chờ không tính); khung OT 4 giờ (chờ + duyệt, sau ngày nợ) → `registeredMinutes 240`, `remainingMinutes 240`; ngày duyệt là ngày lễ về sau → bỏ nợ (T8). `hasOvertime`: tháng chỉ có khung trả nợ → `false`; có thêm khung vượt nợ → `true`; tháng không có nợ → nghĩa cũ (có đơn OT).
  - Tháng có nghỉ có làm bù + còn nợ 240: nộp OT khung làm 4 giờ (240 phút) → nhận; khung làm 5 giờ → từ chối "Tháng 11 có đơn nghỉ có làm bù, chỉ đăng ký OT để trả nợ nghỉ giữa ca (còn 4 giờ)"; hết nợ (đã đăng ký đủ 240) rồi nộp thêm OT → từ chối "Tháng 11 đã có đơn nghỉ có làm bù, không đăng ký OT được"; tháng có nghỉ có làm bù mà không có nợ → câu cũ.
  - Ngược lại: tháng có nợ 240 và OT 4 giờ đã đăng ký → nộp nghỉ có làm bù **nhận** (không còn OT thật); thêm một khung nữa vượt nợ thì nghỉ có làm bù bị chặn với câu cũ "Tháng 11 đã có đơn OT, không nộp đơn nghỉ có làm bù được".
  - Hai trần: ngày có khung trả nợ 4 giờ + ca 8 giờ + khung OT 1 giờ → vượt 12 giờ bị từ chối như cũ (ngày nửa ca vẫn tính ca 8 giờ, Review Focus 4); tổng tháng 38 giờ đã đăng ký (gồm khung trả nợ) + khung 3 giờ → vượt 40 giờ bị từ chối (T5).
- [ ] **Step 2: Chạy.** **Expected:** FAIL.
- [ ] **Step 3: Cài đặt** "OT thật" = phần `ot` của `allocateHalfShiftDebt` trên phút **đăng ký** (`workMinutes(start, end)`), `events` là đơn nửa ca **đã duyệt** của tháng; dùng chung cho `requestContext`, `planMakeup`, `planOvertime`. Không đổi hai trần.
- [ ] **Step 4: Chạy lại** ba file + `requests-overtime.test.ts`, `requests-makeup.test.ts`, `requests-context.test.ts`. **Expected:** `# fail 0`, `# skipped 0`.
- [ ] **Step 5: Commit** `feat(half-shift): nợ đăng ký, tháng có nghỉ có làm bù, trần OT` — **hết lát 3.**

---

# LÁT 4 — Chốt

### Task 12: Hợp đồng API, yêu cầu cho FE, xác minh toàn bộ

**Files:**
- Modify: `docs/api/v2-contract.md` (thêm mục `#### \`POST /api/v2/requests/half-shift-leave\`` có dòng `**Response 201**`; thêm `half-shift-leave` vào các danh sách 7 loại ở ~dòng 58, 854, 916, 925 và mô tả `request-context`/`dates`/phiếu lương theo spec 6.1, 6.2, 10)
- Create: `docs/fe-yeu-cau/nghi-giua-ca--noi-api-v2.md` (FE cần làm: form chọn ngày + nửa, hiển thị khoá/lý do, công lẻ, dòng "Bù nghỉ giữa ca" trên phiếu và phiếu in, trường `halfShift` ở `/me/today` và `/me/attendance`)
- Test: `test/v2/api-contract-doc.test.ts` (có sẵn)

- [ ] **Step 1: Chạy** `node --import tsx --test test/v2/api-contract-doc.test.ts` **trước khi sửa doc**. **Expected:** FAIL ("Route BE chưa được tài liệu hoá: POST /api/v2/requests/half-shift-leave").
- [ ] **Step 2: Viết doc** như trên; thân/đáp/lỗi chép từ spec mục 6; ví dụ JSON dùng giá trị của spec.
- [ ] **Step 3: Chạy lại file đó.** **Expected:** `# fail 0`.
- [ ] **Step 4: Xác minh toàn bộ** (đặt `PG_TEST_URL`): `npm test` rồi `npm --prefix web run test:ui -- --workers=2`. **Expected:** cả hai `# fail 0`; `npm test` in `# skipped 0` (nếu còn skipped, ghi tên file vào sổ và đặt lại `PG_TEST_URL`).
- [ ] **Step 5: Tự rà soát nhánh:** `git diff --stat main...HEAD`, kiểm các việc: không file ngoài bảng "Cấu trúc file"; không `console.log`/`TODO`; không file `.env`; `git status` sạch.
- [ ] **Step 6: Commit** `docs(half-shift): hợp đồng API và yêu cầu cho FE`.
- [ ] **Step 7: Báo lại cho người dùng, rồi dừng:** liệt kê lệnh đã chạy và kết quả thật, các `Ruling:` trong sổ, những gì chưa kiểm được (FE chưa chạy trên BE thật; số tiền phụ cấp chỉ kiểm bằng fixture). **Không merge, không push.** Review cả nhánh bằng reviewer độc lập và `finishing-a-development-branch` do phiên điều phối làm sau, với sự đồng ý của người dùng.
