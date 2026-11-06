# Vòng đời kỳ lương — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa kỳ lương BE v2 qua các bước thật: Chốt công → Đã tính → Phê duyệt kỳ → Đã trả lương, cùng hai bước lùi (Mở lại công, Huỷ phê duyệt). Một cổng kỳ (`PeriodGate`) chặn chấm công, đơn từ và ngày lễ của tháng đã chốt. Duyệt đơn của tháng đã tính thì tự tính lại phiếu của người đó.

**Architecture:** Thêm module `src/modules/periods/`, chỉ phụ thuộc DB và `AuditLog` toàn cục. Module này giữ máy trạng thái thuần (`domain/`), repository của `payroll_periods` (gồm cả các thao tác trên lần chạy lương khi phê duyệt và huỷ phê duyệt), `PeriodGate` và `PeriodsService`/`PeriodsController`. Các module payroll, attendance, holidays, requests và me nhận `PeriodGate`/`PeriodsService` qua tiêm `@Optional()`, để test cũ dựng service bằng tay vẫn chạy. Thứ tự khoá cố định là `payroll_<tháng>` rồi mới tới `period:<tháng>`. Cổng kỳ lấy khoá chia sẻ, các bước chuyển lấy khoá độc quyền.

**Tech Stack:** NestJS 10, TypeScript chạy bằng `tsx`, Kysely, PostgreSQL 16, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-05-payroll-period-lifecycle-design.md` (duyệt 2026-11-05). Mọi luật lấy từ spec §3 (L1–L3, D1–D10) và ruling §11 (R1–R11). Không đọc `spec/` (v1).

## Global Constraints

- Lệnh test: `npm test`, tức `node --import tsx --test "test/v2/**/*.test.ts"`. Test PG cần `PG_TEST_URL`, thiếu thì tự skip. Chạy một file: `node --import tsx --test test/v2/<file>.test.ts`.
- **Không** chạy `npm run typecheck`, **không** chạy prettier/format check.
- Đổi DB thì sửa thẳng `migrations/postgres/schema.sql`, không thêm file migration đánh số. `src/database/schema.ts` sửa theo.
- Không sửa `web/`. Không đọc `spec/`. Không push, không merge.
- Test PG dùng `withTempDb(t, prefix, run)` trong `test/v2/helpers/pg-temp-db.ts`.
- "Hôm nay" theo giờ VN lấy bằng `businessDateText(this.now())` (`src/common/business-date.ts`). Mọi service mới có `now: () => Date = () => new Date()` để test cố định ngày.
- Khoá advisory: `period:<YYYY-MM>`. Khoá chia sẻ dùng `pg_advisory_xact_lock_shared(hashtextextended(key, 0))`, khoá độc quyền dùng `pg_advisory_xact_lock(hashtextextended(key, 0))`. Lấy theo tháng tăng dần. Ai cần cả hai khoá thì lấy `payroll_<tháng>` trước.
- Mã lỗi và HTTP đúng spec §8.4. Lỗi kỳ đều là `HttpError` (kế thừa `ConflictError`/`BadRequestError` của `src/common`), để controller nào bọc lỗi cũng phải để chúng đi qua nguyên vẹn.
- Câu báo lỗi tiếng Việt, chính xác như sau. `MM/YYYY` là tháng, `DD/MM/YYYY` là ngày.

  | Lỗi | Câu |
  |---|---|
  | `PERIOD_LOCKED` (attendance_locked, calculated) | `Tháng MM/YYYY đã chốt công` |
  | `PERIOD_LOCKED` (approved) | `Kỳ lương tháng MM/YYYY đã phê duyệt` |
  | `PERIOD_LOCKED` (paid) | `Kỳ lương tháng MM/YYYY đã trả lương` |
  | `PERIOD_STATE` | `Kỳ lương tháng MM/YYYY đang ở bước "<nhãn>", không làm được thao tác này` — nhãn: open `Đang chấm công`, attendance_locked `Đã chốt công`, calculated `Đã tính lương`, approved `Đã phê duyệt`, paid `Đã trả lương` |
  | `MONTH_NOT_ENDED` | `Tháng MM/YYYY chưa kết thúc, chưa chốt công được` |
  | `BEFORE_PAYDAY` | `Chưa tới ngày trả lương DD/MM/YYYY` |
  | `PERIOD_BLOCKED` | `approveReason(blockers)` |
  | `REASON_REQUIRED` | `Cần ghi lý do` |
  | `PAYSLIP_NOT_DECIDABLE` | `Chỉ duyệt phiếu khi kỳ lương đã tính sau chốt công` |
  | `PAYROLL_FINALIZED` (KPI) | `Kỳ lương đã phê duyệt, không sửa KPI được` |

- `approveReason`: các phần `"<n> người chưa có phiếu"`, `"<n> phiếu chưa duyệt"`, `"<n> đơn chờ duyệt"`, theo thứ tự đó, chỉ lấy phần có n > 0. Nối bằng `" · "` rồi thêm tiền tố `"Còn "`. Ví dụ: `Còn 2 phiếu chưa duyệt · 1 đơn chờ duyệt`. Không vướng gì thì trả `undefined`.
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Đơn vắt qua hai tháng, chỉ một tháng đã chốt.** Ví dụ đơn nghỉ 30/10–02/11 khi tháng 10 đã chốt: cả đơn phải bị chặn `PERIOD_LOCKED`, kèm `month: '2026-10'`. Test nằm ở Task 7.
2. **Hai Admin bấm Phê duyệt kỳ cùng lúc.** Một lời gọi thành công, lời còn lại nhận `PERIOD_STATE`. Lần chạy chỉ thành `final` một lần. Test nằm ở Task 5.
3. **Lý do toàn khoảng trắng** (`"   "`) ở `unlock`/`unapprove` phải trả `REASON_REQUIRED`. Test nằm ở Task 3 và Task 5.
4. **Tháng sai dạng** (`2026-13`, `abc`, `2026-1`) ở mọi route kỳ phải trả 400 `INVALID_MONTH`, không được trả 500. Test nằm ở Task 3.
5. **Người vào làm sau lần tính**, tức chưa có phiếu: tính vào `missingSlips`. Người đã bị khoá tài khoản (`locked_at` khác null) thì không tính (R2). Test nằm ở Task 5.

---

### Task 1: Domain của kỳ (thuần, không DB)

**Files:**
- Create: `src/modules/periods/domain/period-state.ts`
- Create: `src/modules/periods/domain/payday.ts`
- Create: `src/modules/periods/domain/request-months.ts`
- Create: `src/modules/periods/domain/index.ts` (re-export)
- Create: `src/modules/periods/periods.errors.ts`
- Test: `test/v2/periods-domain.test.ts`

**Interfaces:**
- Produces:
  - `type PeriodStatus = 'open' | 'attendance_locked' | 'calculated' | 'approved' | 'paid'`
  - `type PeriodAction = 'lock' | 'unlock' | 'approve' | 'unapprove' | 'pay'`
  - `type GateUse = 'punch' | 'recalculate' | 'file' | 'explain' | 'review' | 'holiday'`
  - `interface ApproveBlockers { pendingRequests: number; unapprovedSlips: number; missingSlips: Array<{ username: string; name: string }> }`
  - `interface ActionState { enabled: boolean; reason?: string; blockers?: ApproveBlockers }`
  - `nextStatus(from: PeriodStatus, action: PeriodAction): PeriodStatus | null`
  - `gateAllows(status: PeriodStatus, use: GateUse): boolean`
  - `monthEnded(month: string, today: string): boolean`: `today` lớn hơn ngày cuối tháng (R1)
  - `approveReason(b: ApproveBlockers): string | undefined`
  - `availableActions(i: { month: string; status: PeriodStatus; today: string; payday: string; blockers: ApproveBlockers | null }): Partial<Record<PeriodAction, ActionState>>`
  - `monthLabel(month: string): string` (`'2026-10'` → `'10/2026'`) và `STATUS_LABEL: Record<PeriodStatus, string>`
  - `paydayOf(month: string): string`: ngày 10 tháng sau, dạng `YYYY-MM-DD`
  - `interface RequestDates { leaveStartDate?: string | null; leaveEndDate?: string | null; otDate?: string | null; explanationDate?: string | null; changeStartDate?: string | null; changeEndDate?: string | null; advancePeriod?: string | null; makeupDates?: string[]; isatSaturday?: string | null }`
  - `requestMonths(r: RequestDates): string[]`: các tháng không trùng, sắp tăng dần. Khoảng ngày thì lấy mọi tháng từ đầu tới cuối khoảng.
  - Các lỗi trong `periods.errors.ts`:

    | Lớp | Kế thừa | `code` | Trường thêm |
    |---|---|---|---|
    | `PeriodLockedError(month, status)` | `ConflictError` | `PERIOD_LOCKED` | `{ month, status }` |
    | `PeriodStateError(month, status)` | `ConflictError` | `PERIOD_STATE` | `{ month, status }` |
    | `MonthNotEndedError(month)` | `ConflictError` | `MONTH_NOT_ENDED` | — |
    | `BeforePaydayError(month, payday)` | `ConflictError` | `BEFORE_PAYDAY` | `{ payday }` |
    | `PeriodBlockedError(month, blockers)` | `ConflictError` | `PERIOD_BLOCKED` | `{ blockers }` |
    | `ReasonRequiredError()` | `BadRequestError` | `REASON_REQUIRED` | — |
    | `PayslipNotDecidableError(month, status)` | `ConflictError` | `PAYSLIP_NOT_DECIDABLE` | `{ status }` |

    Câu báo lỗi theo bảng ở Global Constraints. Các trường thêm nằm trong `details`.

- [ ] **Step 1: Viết test thất bại** `test/v2/periods-domain.test.ts`:

```ts
test('transitions follow spec §4', () => {
  assert.equal(nextStatus('open', 'lock'), 'attendance_locked');
  assert.equal(nextStatus('attendance_locked', 'unlock'), 'open');
  assert.equal(nextStatus('calculated', 'unlock'), 'open');
  assert.equal(nextStatus('calculated', 'approve'), 'approved');
  assert.equal(nextStatus('approved', 'unapprove'), 'calculated');
  assert.equal(nextStatus('approved', 'pay'), 'paid');
  for (const a of ['lock', 'unlock', 'approve', 'unapprove', 'pay'] as const) assert.equal(nextStatus('paid', a), null);
  assert.equal(nextStatus('approved', 'unlock'), null);
  assert.equal(nextStatus('attendance_locked', 'approve'), null);
});
test('gate table of spec §5', () => {
  for (const u of ['punch', 'recalculate', 'file', 'explain', 'review', 'holiday'] as const) assert.equal(gateAllows('open', u), true);
  for (const s of ['attendance_locked', 'calculated'] as const) {
    assert.deepEqual(['punch', 'recalculate', 'file', 'holiday'].map(u => gateAllows(s, u as any)), [false, false, false, false]);
    assert.equal(gateAllows(s, 'explain'), true);
    assert.equal(gateAllows(s, 'review'), true);
  }
  for (const s of ['approved', 'paid'] as const) for (const u of ['punch', 'explain', 'review', 'holiday'] as const) assert.equal(gateAllows(s, u), false);
});
test('lock shows only after the month ends; pay only from payday', () => {
  const none = { pendingRequests: 0, unapprovedSlips: 0, missingSlips: [] };
  assert.deepEqual(availableActions({ month: '2026-10', status: 'open', today: '2026-10-31', payday: '2026-11-10', blockers: null }), {});
  assert.deepEqual(availableActions({ month: '2026-10', status: 'open', today: '2026-11-01', payday: '2026-11-10', blockers: null }), { lock: { enabled: true } });
  assert.deepEqual(availableActions({ month: '2026-10', status: 'approved', today: '2026-11-09', payday: '2026-11-10', blockers: null }), { unapprove: { enabled: true } });
  assert.deepEqual(availableActions({ month: '2026-10', status: 'approved', today: '2026-11-10', payday: '2026-11-10', blockers: null }), { unapprove: { enabled: true }, pay: { enabled: true } });
  assert.deepEqual(availableActions({ month: '2026-10', status: 'calculated', today: '2026-11-05', payday: '2026-11-10', blockers: none }), { unlock: { enabled: true }, approve: { enabled: true, blockers: none } });
  assert.deepEqual(availableActions({ month: '2026-10', status: 'paid', today: '2026-12-01', payday: '2026-11-10', blockers: null }), {});
});
test('approve reason lists missing, unapproved, pending in that order', () => {
  assert.equal(approveReason({ pendingRequests: 1, unapprovedSlips: 2, missingSlips: [] }), 'Còn 2 phiếu chưa duyệt · 1 đơn chờ duyệt');
  assert.equal(approveReason({ pendingRequests: 0, unapprovedSlips: 0, missingSlips: [{ username: 'a', name: 'A' }] }), 'Còn 1 người chưa có phiếu');
  assert.equal(approveReason({ pendingRequests: 0, unapprovedSlips: 0, missingSlips: [] }), undefined);
});
test('payday is the 10th of next month', () => {
  assert.equal(paydayOf('2026-10'), '2026-11-10');
  assert.equal(paydayOf('2026-12'), '2027-01-10');
});
test('request months cover every date field and both ends of a range', () => {
  assert.deepEqual(requestMonths({ leaveStartDate: '2026-10-30', leaveEndDate: '2026-11-02' }), ['2026-10', '2026-11']);
  assert.deepEqual(requestMonths({ changeStartDate: '2026-09-28', changeEndDate: '2026-11-03' }), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(requestMonths({ otDate: '2026-10-05' }), ['2026-10']);
  assert.deepEqual(requestMonths({ explanationDate: '2026-10-29' }), ['2026-10']);
  assert.deepEqual(requestMonths({ advancePeriod: '2026-10' }), ['2026-10']);
  assert.deepEqual(requestMonths({ isatSaturday: '2026-10-10' }), ['2026-10']);
  assert.deepEqual(requestMonths({ leaveStartDate: '2026-10-20', leaveEndDate: '2026-10-20', makeupDates: ['2026-10-25', '2026-11-01'] }), ['2026-10', '2026-11']);
});
test('period errors carry HTTP status and code', () => {
  const e = new PeriodLockedError('2026-10', 'approved');
  assert.equal(e.status, 409);
  assert.equal(e.message, 'Kỳ lương tháng 10/2026 đã phê duyệt');
  assert.deepEqual(e.details, { code: 'PERIOD_LOCKED', month: '2026-10', status: 'approved' });
  assert.equal(new PeriodLockedError('2026-10', 'calculated').message, 'Tháng 10/2026 đã chốt công');
  assert.equal(new ReasonRequiredError().status, 400);
  assert.equal(new BeforePaydayError('2026-10', '2026-11-10').message, 'Chưa tới ngày trả lương 10/11/2026');
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `node --import tsx --test test/v2/periods-domain.test.ts`
Expected: FAIL, không tìm thấy module `src/modules/periods/domain`.

- [ ] **Step 3: Cài đặt** các hàm và lỗi đúng chữ ký ở khối Interfaces. Với `availableActions`:
  - `approve` chỉ có ở `calculated`: `enabled = approveReason(blockers) === undefined`, kèm `reason` khi bị khoá, kèm `blockers` khi `blockers` khác null;
  - `blockers` null thì coi như không vướng: `approve: { enabled: true }`.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `node --import tsx --test test/v2/periods-domain.test.ts`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit** — `feat(periods): period state machine, gate table, payday and request months`

---

### Task 2: Schema, `PeriodsRepository` và `PeriodGate`

**Files:**
- Modify: `migrations/postgres/schema.sql:87-98`. CHECK còn `('open','attendance_locked','calculated','approved','paid')`; bỏ `reviewed_by`, `reviewed_at`.
- Modify: `src/database/schema.ts` (`PayrollPeriodsTable`: bỏ `reviewed_by`, `reviewed_at`)
- Create: `src/modules/periods/periods.repository.ts`
- Create: `src/modules/periods/period-gate.ts`
- Test: `test/v2/periods-repository.pg.test.ts`

**Interfaces:**
- Consumes: `PeriodStatus`, `GateUse`, `gateAllows`, `PeriodLockedError` (Task 1).
- Produces:
  - `type PeriodRow = Selectable<DB['payroll_periods']>`
  - `class PeriodsRepository { constructor(db: Kysely<DB>) }`, với các phương thức:
    - `find(month: string, trx?: DatabaseTransaction): Promise<PeriodRow | null>`
    - `list(): Promise<PeriodRow[]>`: sắp `month` giảm dần
    - `lockShared(trx: DatabaseTransaction, month: string): Promise<void>`
    - `lockExclusive(trx: DatabaseTransaction, month: string): Promise<void>`
    - `save(trx: DatabaseTransaction, month: string, patch: PeriodPatch): Promise<PeriodRow>`. Chưa có dòng thì chèn với `rev = 1` (lúc đó `patch.status` là bắt buộc). Có dòng rồi thì cập nhật `patch` và `rev = rev + 1`. `PeriodPatch` = mọi cột của `payroll_periods` trừ `month` và `rev`, đều không bắt buộc.
  - `class PeriodGate { constructor(repo: PeriodsRepository) }`, với các phương thức:
    - `statusOf(trx: DatabaseTransaction | undefined, month: string): Promise<PeriodStatus>`: có `trx` thì lấy khoá chia sẻ trước. Không có dòng nghĩa là `'open'`.
    - `hold(trx: DatabaseTransaction | undefined, months: string[], use: GateUse): Promise<void>`: duyệt các tháng không trùng, theo thứ tự tăng dần. Tháng đầu tiên mà `!gateAllows` thì ném `PeriodLockedError(month, status)`.

- [ ] **Step 1: Viết test PG thất bại** `test/v2/periods-repository.pg.test.ts`. Mỗi test dùng `withTempDb(t, 'periods_repo', …)` và `new TransactionCoordinator(db)`.
  - `schema rejects the removed reviewed status`: `INSERT … status 'reviewed'` → lỗi `23514`.
  - `save inserts then bumps rev`:
    - lần 1 với `{ status: 'attendance_locked', attendance_locked_by: 'admin', attendance_locked_at: 'x' }` → `rev === 1`;
    - lần 2 với `{ status: 'open', attendance_locked_by: null, attendance_locked_at: null }` → `rev === 2`, các cột khoá về `null`.
  - `gate blocks a punch in a locked month and lets an explanation through`: lưu `2026-10` là `attendance_locked`; `gate.hold(undefined, ['2026-10'], 'punch')` reject với `{ code: 'PERIOD_LOCKED', month: '2026-10', status: 'attendance_locked' }` (so `err.details`); `hold(undefined, ['2026-10'], 'explain')` resolve; `hold(undefined, ['2026-11'], 'punch')` resolve (tháng chưa có dòng).
  - `gate checks every month and reports the first blocked one`: `2026-10` là `approved` → `hold(undefined, ['2026-11', '2026-10'], 'review')` reject với `month: '2026-10'`.
  - `lock waits for a gate holder` (đồng thời):
    - mở `tx.run` A: `gate.hold(trxA, ['2026-10'], 'punch')`, resolve promise `aHeld`, rồi chờ promise `release`;
    - `await aHeld` rồi mới mở `tx.run` B: `repo.lockExclusive(trxB, '2026-10')`, rồi `order.push('lock')`;
    - đợi 200 ms, `order.push('punch-done')`, gọi `release()`, rồi `await` cả hai;
    - kết quả: `assert.deepEqual(order, ['punch-done', 'lock'])`.

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `PG_TEST_URL=postgres://postgres@127.0.0.1:<cổng>/postgres node --import tsx --test test/v2/periods-repository.pg.test.ts`
Expected: FAIL (module chưa có; CHECK còn nhận `reviewed`).

- [ ] **Step 3: Sửa schema** (cả `schema.sql` lẫn `schema.ts`). Cài `PeriodsRepository` và `PeriodGate` theo khối Interfaces. Khoá dùng `sql\`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'period:' + month}, 0))\`` và bản độc quyền tương ứng.

- [ ] **Step 4: Chạy lại test**, cộng `test/v2/pg-date-columns.test.ts` vì nó đọc schema.

Expected: PASS.

- [ ] **Step 5: Commit** — `feat(periods): payroll_periods repository, advisory locks and the period gate; drop reviewed`

---

### Task 3: `PeriodsService` (xem, Chốt công, Mở lại công), controller, module; gỡ phần kỳ khỏi system; `/me`

**Files:**
- Create: `src/modules/periods/periods.service.ts`, `periods.controller.ts`, `periods.module.ts`, `index.ts`
- Modify: `src/app.module.ts` (thêm `PeriodsModule`)
- Modify: `src/modules/system/system.service.ts`: bỏ `listPeriods`, `getPeriod`, `lockPeriod`
- Modify: `src/modules/system/system.controller.ts`: bỏ route `listPeriods`, `lockPeriod`
- Modify: `src/modules/me/me.module.ts`: import `PeriodsModule` thay `SystemModule`
- Modify: `src/modules/me/me.controller.ts`: tham số thứ 5 là `PeriodsService`; `this.periods.getPeriod(m)`
- Delete: `test/v2/system-lock.test.ts`, `test/v2/system-periods.pg.test.ts`. Các test mới dưới đây thay chúng.
- Modify: `test/v2/auth-access.test.ts`: thay hai dòng `SystemController` `listPeriods`/`lockPeriod` bằng các dòng `PeriodsController`
- Modify: `test/v2/me-controller.test.ts`: giả lập `sys` đổi tên thành `periods`, vẫn là `{ getPeriod }`; thêm một ca cho dòng có sẵn ở `status 'open'` (sau Mở lại công)
- Modify: `docs/api/v2-contract.md`: thêm mục `3.7 Periods Module (Kỳ lương)` với `GET /system/periods`, `GET /system/periods/:month`, `lock`, `unlock`, và các mã lỗi `INVALID_MONTH`, `REASON_REQUIRED`, `PERIOD_STATE`, `MONTH_NOT_ENDED`
- Test: `test/v2/periods-service.pg.test.ts`, `test/v2/periods-controller.test.ts`

**Interfaces:**
- Consumes: Task 1 và Task 2; `AuditLog.append(trx, entry)` (`src/modules/audit/audit-log.ts`); `TransactionCoordinator` (`src/database`).
- Produces:
  - `interface PeriodSteps { lockedAt: string | null; lockedBy: string | null; calculatedAt: string | null; calculatedBy: string | null; approvedAt: string | null; approvedBy: string | null; paidAt: string | null; paidBy: string | null }`
  - `interface PeriodView { month: string; status: PeriodStatus; steps: PeriodSteps; payday: string; actions: Partial<Record<PeriodAction, ActionState>> }`
  - `class PeriodsService { now: () => Date; constructor(repo: PeriodsRepository, tx: TransactionCoordinator, audit: AuditLog) }`, với các phương thức:
    - `list(): Promise<PeriodRow[]>`
    - `getPeriod(month: string): Promise<PeriodRow | null>`: giữ đúng tên cũ cho `/me`
    - `snapshot(month: string): Promise<{ status: PeriodStatus; rev: number }>`: chưa có dòng thì `{ 'open', 0 }`
    - `view(month: string): Promise<PeriodView>`. Trong task này `blockers` luôn là `null`; Task 5 sẽ nối vào.
    - `lock(month: string, actor: string): Promise<PeriodView>`
    - `unlock(month: string, actor: string, reason: unknown): Promise<PeriodView>`
    - `protected transition(month: string, action: PeriodAction, actor: string, reason: string | null, apply: (trx: DatabaseTransaction, row: PeriodRow | null) => Promise<PeriodPatch>, trx?: DatabaseTransaction): Promise<PeriodView>`.
      - Có `trx` thì chạy trên `trx` đó; không có thì tự mở `tx.run`.
      - Gọi `repo.lockExclusive`, đọc dòng, rồi kiểm `nextStatus(from, action)`. Không có bước thì ném `PeriodStateError`.
      - Gọi `apply` lấy `patch`, `repo.save(trx, month, { status: next, ...patch })`, rồi `audit.append(trx, { actor, action: 'period.' + action, entityKind: 'period', entityId: month, month, before: { status: from }, after: { status: next }, reason, sensitivity: 'normal' })`.
      - Sau khi giao dịch commit thì trả `view(month)`. Khi `trx` do người gọi truyền vào, người gọi tự gọi `view` sau commit.
      - Task 5 dùng lại hàm này.
  - `PeriodsController` mang `@Controller('api/v2/system/periods')`, có 7 phương thức:

    | Phương thức | Route | Quyền |
    |---|---|---|
    | `listPeriods` | `GET` | `config.read` |
    | `getPeriod` | `GET :month` | `config.read` |
    | `lockPeriod` | `POST :month/lock` | `attendance.lock` |
    | `unlockPeriod` | `POST :month/unlock` | `attendance.lock` |
    | `approvePeriod` | `POST :month/approve` | `payroll.approve` |
    | `unapprovePeriod` | `POST :month/unapprove` | `payroll.approve` |
    | `payPeriod` | `POST :month/pay` | `payroll.approve` |

    Ba route cuối do Task 5 thêm. Tháng không khớp `/^\d{4}-(0[1-9]|1[0-2])$/` thì trả `BadRequestError` với `code: 'INVALID_MONTH'`. `GET` danh sách trả `{ periods }`; các route còn lại trả `PeriodView`.
  - `PeriodsModule` export `PeriodsRepository`, `PeriodGate`, `PeriodsService`.

Luật:
- `lock`: kỳ ở `open` (hoặc chưa có dòng). `monthEnded(month, today)`, sai thì ném `MonthNotEndedError`. Ghi `attendance_locked_by/at`.
- `unlock`: `reason` là chuỗi; trim xong mà rỗng thì ném `ReasonRequiredError`. Đặt `attendance_locked_by/at`, `calculated_by/at` về `null` và `reopen_count + 1`.

- [ ] **Step 1: Viết test thất bại.** `periods-service.pg.test.ts` dùng `withTempDb`, `new PeriodsService(new PeriodsRepository(db), new TransactionCoordinator(db), new AuditLog(new AuditRepository(db), new TransactionCoordinator(db)))`:
  - `lock before the month ends is refused`: `now = 2026-10-31T10:00+07:00` → `lock('2026-10','admin')` reject `MONTH_NOT_ENDED`.
  - `lock after the month ends writes the period and the audit row`: `now = 2026-11-01T08:00+07:00`. `view.status === 'attendance_locked'`, `view.steps.lockedBy === 'admin'`, `view.actions` deep-equal `{ unlock: { enabled: true } }`. `audit_log` có một dòng `action 'period.lock'`, `entity_id '2026-10'`, `before_json` `{"status":"open"}`, `after_json` `{"status":"attendance_locked"}`.
  - `locking twice is a state error`: lần 2 reject `{ code: 'PERIOD_STATE', status: 'attendance_locked' }`.
  - `unlock needs a reason, then clears the lock and calculated stamps`:
    - `unlock(…, '   ')` reject `REASON_REQUIRED`;
    - chèn tay `calculated_by/at` rồi đặt `status 'calculated'`;
    - `unlock(…, 'Chấm thay cho Châu 31/10')` → `status 'open'`, cả 4 cột về `null`, `reopen_count === 1`;
    - dòng nhật ký `period.unlock` có `reason` đó.
  - `view of an open month before its end has no actions and the default payday`: `view('2026-11')` với `now` 2026-11-05 → `{ status: 'open', payday: '2026-12-10', actions: {} }`.

  `periods-controller.test.ts`, giả lập service bằng một object:
  - mỗi route có `:month` với `'2026-13'`, `'abc'`, `'2026-1'` → `BadRequestError` `INVALID_MONTH`;
  - `lockPeriod('2026-10', { username: 'admin' })` gọi `service.lock('2026-10', 'admin')` và trả nguyên kết quả;
  - `unlockPeriod` truyền `body.reason`.

  `auth-access.test.ts`: các dòng `[PeriodsController, '<tên>', cap(...)]` cho `listPeriods`, `getPeriod`, `lockPeriod`, `unlockPeriod`.

  `me-controller.test.ts` (spec §12.12): `getPeriod` trả `{ month: '2026-10', status: 'open' }` → `periodState === 'open'`. Ca `attendance_locked` → `'locked'` và ca `null` → `'open'` giữ nguyên.

- [ ] **Step 2: Chạy test, xác nhận thất bại.** Gồm bốn file `periods-service.pg`, `periods-controller`, `auth-access`, `me-controller`.

- [ ] **Step 3: Cài đặt** theo khối Interfaces và các luật trên. Gỡ phần kỳ khỏi system và chuyển `/me` sang `PeriodsService`.

- [ ] **Step 4: Chạy `npm test` với `PG_TEST_URL`.**

Expected: PASS, không còn tham chiếu nào tới `SystemService.lockPeriod`. Kiểm bằng `rg "lockPeriod|listPeriods" src test`; chỉ được còn `PeriodsController`.

- [ ] **Step 5: Commit** — `feat(periods): period view, Chốt công with month-end check, Mở lại công with reason; move routes off system`

---

### Task 4: Nối với Bảng lương (tự sang Đã tính, duyệt phiếu chỉ khi Đã tính, KPI)

**Files:**
- Modify: `src/modules/periods/periods.service.ts`: thêm `markCalculated`
- Modify: `src/modules/payroll/payroll.service.ts`: ctor thêm `@Optional() @Inject(PeriodsService) private readonly periods?: PeriodsService`; sửa `calculatePeriodPayslips`, `decidePayslip`, `setKpiScore`; thêm `resetDecision`
- Modify: `src/modules/payroll/payroll.repository.ts`: thêm `resetDecision(month, employeeId)`
- Modify: `src/modules/payroll/payroll.controller.ts`: `setKpiScore` map `PayrollFinalizedError` → `ConflictError` `PAYROLL_FINALIZED`
- Modify: `src/modules/payroll/payroll.module.ts`: `imports: [PeriodsModule]`
- Test: `test/v2/payroll-period.pg.test.ts`

**Interfaces:**
- Consumes: `PeriodsService.snapshot`, `PeriodsRepository.lockExclusive/find/save` (Task 2–3); `PayrollFinalizedError` (có sẵn); `PayslipNotDecidableError` (Task 1).
- Produces:
  - `PeriodsService.markCalculated(trx: DatabaseTransaction | undefined, month: string, o: { runId: number; actor: string; full: boolean; expectedRev: number }): Promise<PeriodStatus>`. Hàm này lấy khoá độc quyền trên `trx`; không có `trx` thì tự mở `tx.run`. Sau đó:
    - nếu `rev` hiện tại (chưa có dòng thì 0) khác `expectedRev`: không đổi gì, trả trạng thái hiện tại (R4);
    - nếu kỳ ở `attendance_locked` và `full`: lưu `{ status: 'calculated', calculated_by, calculated_at, current_run_id }`, không ghi nhật ký (spec §10);
    - nếu kỳ ở `calculated`: lưu `calculated_by/at` và `current_run_id`, trạng thái giữ nguyên;
    - các trường hợp còn lại: không đổi gì.
  - `PayrollRepository.resetDecision(month: string, employeeId: string): Promise<boolean>`: phiếu của người đó (tìm theo uuid hoặc username) trong lần chạy nháp mới nhất về `status 'draft'`, xoá `decided_by`, `decided_at`, `note`, `rev + 1`. Trả `false` khi không có phiếu nào.
  - `PayrollService.resetDecision(month: string, employeeId: string): Promise<boolean>`: chuyển thẳng sang repository.

Luật:
- `calculatePeriodPayslips`:
  - chạy `doCalc(trx)` dưới `withLock('payroll_' + month)`, nhận `trx` của khoá;
  - đầu `doCalc` gọi `snapshot`. Kỳ `approved`/`paid` thì ném `PayrollFinalizedError` ngay, trước khi tính;
  - sau khi lưu, nếu `runId !== null`, gọi `markCalculated(trx, month, { runId, actor, full: !isPartial, expectedRev: snapshot.rev })`.
- `decidePayslip`: chạy dưới `withLock('payroll_' + month)`. `snapshot.status !== 'calculated'` thì ném `PayslipNotDecidableError`.
- `setKpiScore`: kỳ `approved`/`paid` thì ném `PayrollFinalizedError('Kỳ lương đã phê duyệt, không sửa KPI được')`.
- Không có `periods` (test cũ dựng tay) thì mọi thứ chạy như trước.

- [ ] **Step 1: Viết test PG thất bại** `payroll-period.pg.test.ts`.
  - Fixture: 2 nhân sự `nv` bậc 1 (uuid khác username, như `requests-review.pg.test.ts`); `PayrollService(new PayrollRepository(db), tx, periods)`.
  - `a full run after Chốt công moves the period to calculated`: lock `2026-10` (`now` 2026-11-01) → `calculatePeriodPayslips('2026-10', undefined, 'admin')` → `view.status === 'calculated'`, `steps.calculatedBy === 'admin'`, `current_run_id` bằng `runId`.
  - `a one-person run after Chốt công keeps attendance_locked`.
  - `a run while open keeps the month open`: `snapshot('2026-10').status === 'open'`, có `payroll_runs`.
  - `a stale rev does not promote`: gọi `markCalculated(undefined, '2026-10', { …, full: true, expectedRev: 0 })` khi `rev` là 1 → trả `'attendance_locked'`.
  - `deciding a payslip needs a calculated period`: ở `attendance_locked`, `decidePayslip` reject `PAYSLIP_NOT_DECIDABLE`; sau khi tính cả kỳ thì `approved`.
  - `KPI is frozen once the period is approved`: đặt tay `status 'approved'` → `setKpiScore` reject `PayrollFinalizedError`; `calculatePeriodPayslips` cũng reject `PayrollFinalizedError`.
  - `resetDecision puts an approved payslip back to draft`.

- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Cài đặt** theo khối Interfaces và các luật trên.
- [ ] **Step 4: Chạy file mới và các test payroll có sẵn** (`payroll*.test.ts`, `me-controller.test.ts`).

Expected: PASS.

- [ ] **Step 5: Commit** — `feat(payroll): full run after Chốt công marks the period calculated; decisions only when calculated; KPI frozen after approval`

---

### Task 5: Phê duyệt kỳ, Huỷ phê duyệt, Đã trả lương

**Files:**
- Modify: `src/modules/periods/periods.repository.ts`: thêm `blockers`, `currentRun`, `finalizeRun`, `reopenRun`
- Modify: `src/modules/periods/periods.service.ts`: thêm `approve`, `unapprove`, `pay`; `view` tính `blockers` khi kỳ `calculated`
- Modify: `src/modules/periods/periods.controller.ts`: thêm `approvePeriod`, `unapprovePeriod`, `payPeriod`
- Modify: `test/v2/auth-access.test.ts`: 3 dòng mới, quyền `payroll.approve`
- Modify: `docs/api/v2-contract.md` mục 3.7: thêm `approve`, `unapprove`, `pay`, `PERIOD_BLOCKED`, `BEFORE_PAYDAY`
- Test: `test/v2/periods-approve.pg.test.ts`

**Interfaces:**
- Consumes: `transition` (Task 3), `requestMonths` (Task 1), `PayrollService` chỉ dùng trong test để có lần chạy (Task 4).
- Produces:
  - `PeriodsRepository.currentRun(trx: DatabaseTransaction | undefined, month: string): Promise<{ id: number; runNo: number; status: string } | null>`: lần chạy mới nhất mà `status <> 'superseded'`
  - `PeriodsRepository.blockers(trx: DatabaseTransaction | undefined, month: string): Promise<ApproveBlockers>`. Đếm ba thứ:
    - `pendingRequests`: số đơn `system_requests.status = 'PENDING'` mà `requestMonths(...)` có `month`. Ngày làm bù lấy từ `makeup_slots.work_date`, Thứ Bảy iSAT lấy từ `isat_registrations.saturday`. Cột DATE đổi bằng `toDateText`.
    - `unapprovedSlips`: số phiếu của `currentRun` có `status <> 'approved'`.
    - `missingSlips`: nhân sự có `locked_at IS NULL` mà `username` không có trong phiếu của `currentRun`, sắp theo `username`, dạng `{ username, name }`.
  - `PeriodsRepository.finalizeRun(trx: DatabaseTransaction, runId: number): Promise<void>`: `draft → final`
  - `PeriodsRepository.reopenRun(trx: DatabaseTransaction, month: string, actor: string, now: string): Promise<number>`. Lần chạy `final` của tháng chuyển sang `superseded`. Chèn lần chạy `draft` mới với `run_no = max + 1`; mọi cột chép từ lần `final`, trừ `created_by = actor`, `created_at = finished_at = now`. Chép mọi phiếu sang lần chạy mới, giữ `status`, `decided_by/at`, `note`, `rev`, `override_json`, `flags_json`. Trả id lần chạy mới.
  - `PeriodsService.approve(month: string, actor: string): Promise<PeriodView>`. Chạy `tx.withLock('payroll_' + month)`, rồi lấy khoá độc quyền kỳ trên cùng `trx`; vì vậy `transition` phải nhận được một `trx` có sẵn. Kỳ phải ở `calculated`, không thì `PeriodStateError`. `blockers` mà vướng thì `PeriodBlockedError`. Xong thì `finalizeRun(currentRun.id)` và lưu `{ approved_by, approved_at, current_run_id }`.
  - `PeriodsService.unapprove(month: string, actor: string, reason: unknown): Promise<PeriodView>`. `reason` bắt buộc. Chạy dưới `payroll_<month>`, gọi `reopenRun`, rồi lưu `{ status: 'calculated', approved_by: null, approved_at: null, current_run_id: newId }`.
  - `PeriodsService.pay(month: string, actor: string): Promise<PeriodView>`. Kỳ ở `approved`. `today < paydayOf(month)` thì `BeforePaydayError`. Xong thì lưu `{ paid_by, paid_at }`.

- [ ] **Step 1: Viết test PG thất bại** `periods-approve.pg.test.ts`. Fixture: 2 nhân sự `nv` bậc 1; lock `2026-10`; tính cả kỳ; `now` 2026-11-05.
  - `approve is blocked by unapproved payslips, pending requests and people without a payslip`:
    - duyệt 1 trên 2 phiếu;
    - chèn một `system_requests` `PENDING` loại `LEAVE`, `leave_start_date = leave_end_date = '2026-10-30'`;
    - chèn nhân sự thứ 3 sau khi tính (`locked_at` null), và nhân sự thứ 4 có `locked_at` khác null;
    - `approve` reject `PERIOD_BLOCKED`, `details.blockers` deep-equal `{ pendingRequests: 1, unapprovedSlips: 1, missingSlips: [{ username: <ns3>, name: <tên ns3> }] }`;
    - `view(...).actions.approve` deep-equal `{ enabled: false, reason: 'Còn 1 người chưa có phiếu · 1 phiếu chưa duyệt · 1 đơn chờ duyệt', blockers: <như trên> }`.
  - `a pending request of another month does not block`: đơn `PENDING` OT ngày `2026-11-03`; mọi phiếu đã duyệt; không có ns3 → `approve` resolve.
  - `approve freezes the run`:
    - `status 'approved'`, lần chạy hiện tại `final`;
    - `UPDATE payslips SET note='x'` trên phiếu đó → lỗi trigger (`23000`);
    - nhật ký `period.approve`.
  - `two approves at once: one wins`: `Promise.allSettled([approve, approve])` → 1 fulfilled, 1 rejected `PERIOD_STATE`; `SELECT count(*) FROM payroll_runs WHERE month='2026-10' AND status='final'` = 1.
  - `unlock is not allowed after approval`: `unlock(..., 'lý do')` reject `PERIOD_STATE`.
  - `unapprove keeps the approved payslips in a new draft run`:
    - `unapprove(…, '   ')` reject `REASON_REQUIRED`;
    - `unapprove(…, 'sai KPI Bình')` → `status 'calculated'`, `steps.approvedAt === null`;
    - lần `final` cũ thành `superseded`; lần chạy mới `draft` có `run_no` lớn hơn;
    - 2 phiếu `approved`, cùng `decided_by`;
    - `PayrollService.listPayslips('2026-10')` đọc ra lần chạy mới;
    - nhật ký `period.unapprove` có `reason`.
  - `pay only from payday, then nothing more`:
    - `now` 2026-11-09 → reject `{ code: 'BEFORE_PAYDAY', payday: '2026-11-10' }`;
    - `now` 2026-11-10 → `status 'paid'`, `view.actions` deep-equal `{}`;
    - `unapprove` reject `PERIOD_STATE`.
  - Thêm `periods-controller.test.ts`: `approvePeriod`, `unapprovePeriod` (truyền `reason`), `payPeriod` gọi đúng service.

- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Cài đặt** theo khối Interfaces.
- [ ] **Step 4: Chạy `npm test` với `PG_TEST_URL`.**

Expected: PASS.

- [ ] **Step 5: Commit** — `feat(periods): Phê duyệt kỳ with blockers, Huỷ phê duyệt copying the approved payslips, Đã trả lương from payday`

---

### Task 6: Cổng kỳ ở chấm công và ngày lễ

**Files:**
- Modify: `src/modules/attendance/attendance.service.ts`. Ctor thêm `@Optional() @Inject(PeriodGate) private readonly periodGate?: PeriodGate`.
  - `recordPunch`: `withLock(lockKey, trx => executePunch(trx))`; dòng đầu của `executePunch` là `await this.periodGate?.hold(trx, [workDate.slice(0, 7)], 'punch')`.
  - `recalculateTimesheet`: dòng đầu là `await this.periodGate?.hold(undefined, [workDate.slice(0, 7)], 'recalculate')`.
- Modify: `src/modules/attendance/attendance.controller.ts`: `recordPunch` và `recalculateTimesheet` thêm `if (err instanceof HttpError) throw err;` trước khi bọc 400.
- Modify: `src/modules/attendance/attendance.module.ts`: `imports: [PeriodsModule]`
- Modify: `src/modules/holidays/holidays.service.ts`. Ctor thêm `@Optional() @Inject(PeriodGate)`.
  - `add`, `remove`: `hold(undefined, [date.slice(0, 7)], 'holiday')` trước khi ghi.
  - `quickAdd`: bỏ qua mọi ngày mà `!gateAllows(await gate.statusOf(undefined, month), 'holiday')`. Không báo lỗi, ngày bị bỏ không có trong mảng trả về.
- Modify: `src/modules/holidays/holidays.controller.ts`: để `HttpError` đi qua nguyên vẹn
- Modify: `src/modules/holidays/holidays.module.ts`: `imports: [PeriodsModule]`
- Test: `test/v2/periods-gate-attendance.pg.test.ts`, và thêm vào `test/v2/holidays.test.ts`

**Interfaces:**
- Consumes: `PeriodGate.hold`, `PeriodGate.statusOf`, `gateAllows` (Task 1–2).
- Produces: không có gì mới; chỉ đổi hành vi các route có sẵn sang 409 `PERIOD_LOCKED`.

Ruling của plan:

- `recalculateTimesheet` và holidays gọi `hold` không kèm `trx`, tức chỉ kiểm, không giữ khoá. Hai service này không có giao dịch, và chỉ Admin dùng. Rủi ro: một lần sửa đúng vào giây đang Chốt công có thể lọt qua.
- Gộp với nhánh `claude/audit-wiring` (6f9dadc, chưa vào `main`). Nhánh đó đổi `HolidaysService`:
  - chữ ký mới: `add(input, actor)`, `quickAdd(year, actor)`, `remove(date, actor)`;
  - ctor thêm `TransactionCoordinator`, `AuditLog`; ghi trong `this.tx.run(trx => …)`;
  - `HolidaysRepository.remove` trả `{ date, name } | null`.

  Dòng kiểm kỳ đặt **trước** `tx.run`, sau khi kiểm ngày hợp lệ, để hai phần sửa nằm ở hai chỗ khác nhau. Tham số `PeriodGate` thêm vào cuối ctor. Nhánh nào vào `main` trước thì nhánh sau gộp theo.
- `quickAdd` bỏ qua ngày của tháng đã chốt thay vì báo lỗi cả năm. Spec §5 chỉ ghi `quickAdd` qua cổng `holiday`. Ví dụ: tháng 11/2026, tháng 1–10 đã chốt, Admin bấm "Thêm lễ cố định 2026" → chỉ thêm 01/01, 30/04, 01/05, 02/09 nếu tháng đó còn mở. Nếu báo lỗi thì cả năm không thêm được. Rủi ro nếu sai: Admin không biết vì sao thiếu ngày; FE hiện danh sách ngày đã thêm.

- [ ] **Step 1: Viết test thất bại.**
  - `periods-gate-attendance.pg.test.ts`, dùng `AttendanceService(new AttendanceRepository(db), tx, gate)`:
    - `a punch on a day of a locked month is refused`: `2026-10` `attendance_locked` → `recordPunch({ employeeId, type: 'IN', workDate: '2026-10-20' })` reject `{ code: 'PERIOD_LOCKED', month: '2026-10' }`; không có dòng `punch_events` nào được ghi.
    - `a punch in an open month still works`: `workDate '2026-11-03'` resolve.
    - `recalculating a day of a locked month is refused`.
  - `holidays.test.ts`, với `PeriodGate` giả lập trả `'attendance_locked'` cho `2026-09`:
    - `add` `2026-09-02` reject `PERIOD_LOCKED`;
    - `remove` `2026-09-02` reject `PERIOD_LOCKED`;
    - `quickAdd(2026)` trả `['2026-01-01','2026-04-30','2026-05-01']`;
    - controller `create` ném lại đúng `PeriodLockedError`, không bọc thành 400.
  - `attendance.test.ts` hoặc `me-controller.test.ts`: `AttendanceController.recordPunch` và `MeController` (route chấm công của NV) nhận `PeriodLockedError` từ service thì ném lại đúng lỗi đó (409), không bọc thành 400.

- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Cài đặt** như mô tả ở mục Files.
- [ ] **Step 4: Chạy file mới, cộng `attendance.test.ts`, `holidays.test.ts`, `me-controller.test.ts`.**

Expected: PASS.

- [ ] **Step 5: Commit** — `feat(periods): the period gate blocks punches, timesheet recalculation and holidays of a locked month`

---

### Task 7: Cổng kỳ ở đơn từ và tự tính lại khi duyệt đơn

**Files:**
- Modify: `src/modules/requests/requests.service.ts`
  - Ctor thêm, ở cuối, `@Optional() @Inject(PeriodGate) private readonly periodGate?: PeriodGate` và `@Optional() @Inject(PayrollService) private readonly payroll?: PayrollService`.
  - `underEmployeeLock` đổi kiểu `fn` thành `(stores: RequestStores, trx?: DatabaseTransaction) => Promise<T>`.
  - Thêm `private datesOf(req: SystemRequest): RequestDates`, với `makeupDates = req.makeupSlots.map(s => s.date)` và `isatSaturday = req.isat?.saturday ?? null`.
  - Thêm `private guardPeriods(trx, req, use)`, gọi `periodGate?.hold(trx, requestMonths(this.datesOf(req)), use)`.
  - Gọi `guardPeriods` ngay trước mỗi `stores.requests.save(req)` của 7 hàm `create*`: giải trình dùng `'explain'`, còn lại `'file'`.
  - Trong `reviewRequest`, gọi `guardPeriods` ngay sau `lockEmployee`, với `'review'`.
- Modify: cùng file. Tách phần thân của `reviewRequest` thành `private decide(...)`, trả `{ dto, months: string[], employeeId: string }`. `reviewRequest` giữ chữ ký cũ và trả `dto`. Thêm `reviewAndRecalculate`.
- Modify: `src/modules/requests/request-http.ts`: `dayConflictHttp` trả luôn `err` khi `err instanceof HttpError`, cập nhật chú thích. Sửa này đủ cho 8 route tạo đơn và route duyệt.
- Modify: `src/modules/requests/requests.controller.ts`: `reviewRequest` gọi `reviewAndRecalculate` và trả `{ updated: true, request, recalculated }`.
- Modify: `src/modules/requests/requests.module.ts`: `imports` thêm `PeriodsModule`, `PayrollModule`
- Modify: `docs/api/v2-contract.md`: mục `PATCH /requests/:id/review` thêm `recalculated`; mục quy ước của 3.4 thêm `PERIOD_LOCKED` (409) cho các route tạo đơn và duyệt đơn
- Test: `test/v2/requests-period.pg.test.ts`, và thêm vào `test/v2/requests-review.test.ts` nếu nó kiểm hình dạng phản hồi của controller

**Interfaces:**
- Consumes: `PeriodGate.hold/statusOf`, `requestMonths`, `RequestDates` (Task 1–2); `PayrollService.calculatePeriodPayslips`, `PayrollService.resetDecision` (Task 4).
- Produces:
  - `type RecalcResult = { month: string; ok: boolean; error?: string }`
  - `RequestsService.reviewAndRecalculate(id: string, reviewer: string, action: 'APPROVE' | 'REJECT', note?: string): Promise<{ request: SystemRequestDTO; recalculated: RecalcResult[] }>`. Hàm này gọi `decide` (đã commit xong), rồi xét lần lượt các tháng của đơn theo thứ tự tăng dần. Chỉ tháng nào `statusOf(undefined, month) === 'calculated'` mới gọi `payroll.calculatePeriodPayslips(month, [employeeId], reviewer)`.
    - Kết quả không có `errors` → `{ month, ok: true }`.
    - Có `errors`, hoặc lời gọi ném lỗi → `payroll.resetDecision(month, employeeId)`, rồi `{ month, ok: false, error: <errors[0].message hoặc err.message> }`.

- [ ] **Step 1: Viết test PG thất bại** `requests-period.pg.test.ts`.
  - Service dựng như `serviceOn` của `requests-review.pg.test.ts`, cộng `gate` và `PayrollService` (có `periods`). 2 nhân sự `nv` bậc 1, `uuid ≠ username`.
  - `filing leave, OT, shift change, makeup or advance into a locked month is refused`:
    - `2026-10` `attendance_locked`;
    - mỗi loại `create*` có ngày (hoặc kỳ tạm ứng) trong tháng 10 reject `{ code: 'PERIOD_LOCKED', month: '2026-10' }`;
    - không có dòng `system_requests` mới.
  - `a leave across 30/10–02/11 is refused when only October is locked`, với `month: '2026-10'`.
  - `an explanation for a locked month is still accepted, but not once approved`:
    - `attendance_locked` → resolve;
    - đặt `approved` → đơn giải trình ngày khác reject `PERIOD_LOCKED` `status 'approved'`.
  - `approving an explanation in a calculated month recalculates only that person`:
    - lock, tính cả kỳ, duyệt cả 2 phiếu;
    - nộp giải trình `2026-10-29` cho ns1, rồi `reviewAndRecalculate(id, 'admin-username', 'APPROVE')` → `recalculated` deep-equal `[{ month: '2026-10', ok: true }]`;
    - phiếu ns1 ở lần chạy mới là `draft`, phiếu ns2 vẫn `approved`.
  - `reviewing in an attendance_locked month does not recalculate`: `recalculated` deep-equal `[]`; số dòng `payroll_runs` không đổi.
  - `a failed recalculation puts the old payslip back to draft`:
    - dùng `class FailingPayroll extends PayrollService { override async calculatePeriodPayslips(): Promise<never> { throw new Error('Thiếu cấu hình bậc 9'); } }`, `resetDecision` là của thật;
    - ở `calculated` với cả 2 phiếu đã duyệt, nộp rồi duyệt một giải trình của ns1;
    - kết quả `recalculated` deep-equal `[{ month: '2026-10', ok: false, error: 'Thiếu cấu hình bậc 9' }]`;
    - phiếu ns1 là `draft`, `decided_by` null; phiếu ns2 vẫn `approved`; đơn vẫn `APPROVED`.
  - `reviewing a request of an approved month is refused`: chèn đơn `PENDING` tháng 10 rồi đặt tay kỳ `approved` → `reviewRequest` reject `PERIOD_LOCKED`.
  - Kiểm controller (thêm vào test có sẵn, hoặc trong file mới, với service giả lập): `reviewRequest` trả `{ updated: true, request, recalculated }`; `createLeave` ném `PeriodLockedError` thì ra nguyên lỗi đó, không ra `BadRequestError`.

- [ ] **Step 2: Chạy, xác nhận thất bại.**
- [ ] **Step 3: Cài đặt** như mô tả ở mục Files.
- [ ] **Step 4: Chạy `npm test` với `PG_TEST_URL`.**

Expected: PASS cả bộ, 0 fail.

- [ ] **Step 5: Commit** — `feat(requests): the period gate blocks filing into a locked month; reviewing in a calculated month recalculates that person`

---

## Sau các task

- Review toàn nhánh (`superpowers:requesting-code-review`). Có lỗi thì sửa một đợt, rồi review lại trong phạm vi hẹp.
- Xác minh (`superpowers:verification-before-completion`):
  - container `postgres:16` dùng một lần, tên riêng của phiên, cổng chưa ai dùng (không dùng 55442, 55465, 55466), trust auth;
  - `PG_TEST_URL=postgres://postgres@127.0.0.1:<cổng>/postgres npm test`;
  - xong thì `docker rm -f` đúng container đó.
- Báo cáo gồm:
  - lệnh đã chạy và kết quả thật;
  - các màn FE còn phải nối (spec §14);
  - các route chưa có test HTTP qua Nest thật: mọi route kỳ chỉ có test controller với service giả lập, cộng test service trên PG.
