# Detailed Audit Report: Background Jobs, Async Execution & Pure Logic Redundancy

**Auditor:** Explorer 3 (Background Jobs & Dead Logic Explorer)  
**Date:** 2026-11-04  
**Audit Target:** Vladilena-Milize Backend Codebase (`src/`)  
**Integrity Mode:** DEMO (Strictly Read-Only, Pure Code Logic Verification, Zero Reliance on Code Comments or Test Files)  

---

## 1. Observation

Direct code inspections across `src/main.ts`, `src/platform/`, `src/data/`, `src/domain/`, `src/modules/`, `src/http/`, `src/ops/`, `src/params/`, and `src/engine/` yielded the following concrete, verbatim observations.

---

### Category A: Background Execution & Async Workflow Risks

#### Observation A1: Background Scheduler Collision & Unhandled Promise Rejection in `LeaveAccountService`
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\domain\leave\leave-account-service.ts`
- **Lines:** 83–92
- **Verbatim Source:**
```typescript
  // Hẹn giờ chạy (gọi từ khối khởi động của server.js). Trả hàm dừng
  start(intervalMs?) {
    const run = () => this.refreshAll();
    const first = setImmediate(run);
    const timer = setInterval(run, intervalMs);
    timer.unref();
    return () => {
      clearImmediate(first);
      clearInterval(timer);
    };
  }
```
- **Context Lines:** `src/domain/leave/leave-account-service.ts:60–79`:
```typescript
  async refreshAll(today = this.rules.vnToday()) {
    let checked = 0,
      accounts = 0,
      failed = 0;
    for (const staff of await this.store.listStaff()) {
      try {
        if (await this.refresh(staff, today)) accounts++;
        checked++;
      } catch (error) {
        failed++;
        const mark = `${staff.username}:${error && error.code}`;
        if (!this.reported.has(mark)) {
          this.reported.add(mark);
          console.error(
            `[leave] không tính được phép của ${staff.username}: ${String(error && error.message).slice(0, 200)}`
          );
        }
      }
    }
    return { checked, accounts, failed };
  }
```
- **Observed Behavior:**
  1. `this.refreshAll()` is an `async` function returning a `Promise<{ checked, accounts, failed }>`.
  2. The callback passed to `setImmediate(run)` and `setInterval(run, intervalMs)` is `() => this.refreshAll()`.
  3. The returned Promise is completely unhandled (floating promise). If an error occurs in `this.store.listStaff()` before the try/catch loop, the promise rejects unhandled.
  4. `setInterval` fires at every `intervalMs` regardless of whether the preceding invocation of `this.refreshAll()` has finished.
  5. There is no distributed lock, advisory lock, or in-process running guard flag. If `refreshAll` takes longer than `intervalMs` or if multiple application instances run, concurrent instances execute overlapping mutations on `leave_ledger` and `staff.leave_balance`.

#### Observation A2: Periodic Background Purge Running on Dead `punch_requests` Table
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\main.ts`
- **Lines:** 41–52, 94
- **Verbatim Source:**
```typescript
async function schedulePunchRequestPurge(): Promise<void> {
  const purge = async () => {
    try {
      const removed = await store.purgePunchRequests(config.PUNCH_REQUEST_KEEP_DAYS);
      console.log(`Dọn bảng nhớ lượt chấm công: đã xoá ${removed} dòng cũ hơn ${config.PUNCH_REQUEST_KEEP_DAYS} ngày`);
    } catch (e) {
      console.error('Không dọn được bảng nhớ lượt chấm công:', (e as Error).message);
    }
  };
  await purge();
  setInterval(purge, config.PUNCH_REQUEST_PURGE_MS).unref();
}
...
export async function start(server: http.Server): Promise<void> {
...
  await schedulePunchRequestPurge();
```
- **Associated Definitions:**
  * `src/data/attendance.repository.ts:169–171`:
    ```typescript
    async savePunchRequest(row: Insertable<LegacySchema['punch_requests']>): Promise<void> {
      await this.qb.insertInto('punch_requests').values(row).execute();
    }
    ```
  * `src/platform/attendance-sessions.ts:72–74`:
    ```typescript
    async savePunchRequest(u?, id?, operation?, sid?, response?) {
      await sessionsRepo.savePunchRequest({
    ```
- **Observed Behavior:**
  1. `savePunchRequest` is not called anywhere in any active route, service, or controller across the entire `src/` codebase.
  2. In `src/modules/attendance-v2/` and `src/modules/ui-bridge/ui-bridge.controller.ts:170–189`, punches are routed directly to `AttendanceV2Service.recordPunch` without writing to `punch_requests`.
  3. `schedulePunchRequestPurge` continuously runs an unindexed DELETE query against `punch_requests` on startup and every 24 hours (`PUNCH_REQUEST_PURGE_MS = 86400000`), operating entirely on dead legacy infrastructure.

#### Observation A3: Database Connection Pool Exhaustion & Indefinite Stall Risk
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\data\postgres-database.ts`
- **Lines:** 32, 59, 285–298
- **Verbatim Source:**
```typescript
    this.#driver = new PoolDriver(PostgresDatabase.#pool(options.url, options.max || 10), this.#tx);
...
  static #pool(url?, max?) {
    const { Pool, types } = require('pg');
...
    return new Pool({ connectionString: target.toString(), max, options: startupOptions });
  }
...
  async transaction(write?) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await this.store.run(client, write);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
```
- **Observed Behavior:**
  1. `new Pool(...)` is configured with `max: options.max || 10`.
  2. `connectionTimeoutMillis` is not specified (defaults to `0`, meaning indefinite wait).
  3. `idleTimeoutMillis` and `statement_timeout` are not configured.
  4. In `src/domain/period/periods.ts:352–383` (`calculate`), a transaction is held continuously while calculating and inserting payslips for every employee in `inputs.people` via sequential loop.
  5. In `src/domain/leave/leave-account-service.ts:50–53`, transactions are opened per staff in a loop.
  6. When 10 concurrent requests open transactions or perform queries, all pool connections are held; subsequent incoming requests wait indefinitely with no timeout, causing process-wide connection starvation.

#### Observation A4: SSE Heartbeat Periodic Database Query Storm
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\platform\events.ts`
- **Lines:** 108–112, 161–175, 356–362
- **Verbatim Source:**
```typescript
function startTimer() {
  if (timer) return;
  timer = setInterval(heartbeat, limits().heartbeatSec * MS_PER_SEC);
  if (timer && typeof timer.unref === 'function') timer.unref();
}
...
async function heartbeat() {
  for (const conn of [...conns]) {
    let fresh: any = null;
    try {
      fresh = await conn.checkSession();
    } catch {
      fresh = null;
    }
    if (!fresh) drop(conn, { reason: 'session' });
    else {
      conn.me = fresh;
      write(conn, ': ping\n\n');
    }
  }
}
...
    checkSession:
      opts.checkSession ||
      (async () => {
        const user = await getAuth().readSession(cookie);
        return user && user === me.username ? await getStore().getStaff(user) : null;
      })
```
- **Observed Behavior:**
  1. Default heartbeat period is `EVENTS_HEARTBEAT_SEC` (25 seconds).
  2. For every open SSE connection in `conns`, `heartbeat()` calls `conn.checkSession()`.
  3. `checkSession()` invokes `getStore().getStaff(user)`, which triggers a database query (`SELECT * FROM staff WHERE username = ...`).
  4. If 200 users maintain an active SSE stream, `heartbeat()` triggers 200 sequential database queries every 25 seconds across the event loop, competing for the 10-connection PostgreSQL pool.

#### Observation A5: Batch Calculation Route Missing from Load Shedder Protection
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\ops\route-classes.ts`
- **Lines:** 6–15
- **Verbatim Source:**
```typescript
const HEAVY_ROUTES = Object.freeze(
  new Set<any>([
    'GET /team',
    'GET /alerts',
    'GET /approvals',
    'GET /periods/:month/estimates',
    'GET /staff',
    'PUT /sheet/bulk'
  ])
);
```
- **Context Lines:** `src/http/api-gate.ts:68–73`:
```typescript
    const routeKey = this.authz.routeKey(method, seg);
    if (HEAVY_ROUTES.has(routeKey)) {
      const reason = shedder.check();
      if (reason)
        throw new Overloaded(`Máy chủ đang bận (${reason}), thử lại sau ít giây`, config.OVERLOAD_RETRY_AFTER_SEC);
    }
```
- **Observed Behavior:**
  1. `POST /periods/:month/calculate` (which computes payroll runs and payslips across the entire staff roster) is omitted from `HEAVY_ROUTES`.
  2. `POST /api/v2/payroll/:month/calculate` is also omitted from `HEAVY_ROUTES`.
  3. The load shedder (`shedder.check()`) does not protect the system from concurrent heavy batch payroll executions under severe loop lag or inflight saturation.

---

### Category B: Concurrency, Race Conditions & Lock Deficiencies

#### Observation B1: Missing Advisory Locks & Transaction Boundaries in Attendance V2 Punch Ingestion
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\modules\attendance-v2\attendance-v2.service.ts`
- **Lines:** 74–167
- **Verbatim Source:**
```typescript
  async recordPunch(input: RecordPunchInput): Promise<RecordPunchResult> {
    const workDate = input.workDate || new Date().toISOString().slice(0, 10);

    // 1. Lấy hoặc tạo lịch làm việc cho ngày công
    let schedule = await this.repo.findSchedule(input.employeeId, workDate);
    if (!schedule) {
      if (input.shiftConfig) {
        schedule = WorkSchedule.create({
          employeeId: input.employeeId,
          workDate,
          shiftType: input.shiftConfig.shiftType,
          plannedStartTime: input.shiftConfig.shiftStartTime,
          plannedEndTime: input.shiftConfig.shiftEndTime
        });
        await this.repo.saveSchedule(schedule);
      } else {
        schedule = await this.repo.ensureDefaultSchedule(input.employeeId, workDate);
      }
    }
...
    let timesheet = await this.repo.findTimesheet(input.employeeId, workDate);
    if (timesheet && timesheet.isLocked) {
      throw new Error('Bảng công ngày đã bị khóa cho kỳ lương, không thể tính toán lại');
    }
...
    const punch = PunchEvent.create(punchProps);
    await this.repo.savePunch(punch);

    const punches = await this.repo.findPunches(input.employeeId, workDate);
...
    timesheet = timesheet.calculate(punches, schedule);
    await this.repo.saveTimesheet(timesheet);

    return {
      punch: punch.toJSON(),
      timesheet: timesheet.toJSON()
    };
  }
```
- **Context Lines:** `src/data/locks.ts:9–15`:
```typescript
export class AdvisoryLocks {
  constructor(private readonly qb: Kysely<Schema>) {}

  async acquire(key: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(this.qb);
  }
}
```
- **Observed Behavior:**
  1. `recordPunch` has no `store.transaction(...)` wrapper.
  2. `recordPunch` does not call `locks.acquire(...)` or `store.lock(...)`.
  3. `recordPunch` does not implement any request idempotency verification.
  4. Concurrent punch calls for the same `employeeId` and `workDate` race on reading `findPunches`, inserting `savePunch`, calculating timesheet in memory, and upserting `saveTimesheet`. The last writer overwrites the daily timesheet state.

#### Observation B2: Concurrency Race & Constraint Violation `23505` on `payroll_runs` in Period Calculation
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\domain\period\periods.ts`
- **Lines:** 349–363
- **Verbatim Source:**
```typescript
async function calculate(month, { rev }: any, actx?, by?) {
  await precheck(month, rev, ['attendance_locked', 'calculated', 'reviewed']);
  const resolved = await paramsStore.resolve(month);
  return await store.transaction(async () => {
    const inputs = await service.loadInputs(month);
    const run = await store.payroll.createRun(month, {
      engineVersion: Engine.ENGINE_VERSION,
      paramsHash: resolved.hash,
      paramsRev: resolved.rev,
      params: resolved.params,
      switches: service.contextOf(inputs),
      inputsDigest: service.digestOf(inputs),
      by
    });
```
- **Context Lines:** `src/data/payroll.repository.ts:61–73` & `migrations/postgres/0001_baseline.sql:110`:
```typescript
  async nextRunNo(month: string): Promise<number> {
    const row = await this.qb
      .selectFrom('payroll_runs')
      .select(sql<number>`COALESCE(MAX(run_no), 0) + 1`.as('n'))
      .where('month', '=', month)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }
```
```sql
CREATE TABLE payroll_runs (
...
    UNIQUE (month, run_no)
);
```
- **Observed Behavior:**
  1. `precheck(month, rev, ...)` executes outside `store.transaction`.
  2. Neither `calculate` nor `createRun` acquires an advisory lock (`pg_advisory_xact_lock`) on `period:calculate:${month}`.
  3. Two concurrent `calculate` calls with the same `rev` both pass `precheck`, both query `COALESCE(MAX(run_no), 0) + 1` resulting in identical `run_no`, and one transaction crashes with PostgreSQL unique violation `23505`.

#### Observation B3: Non-Transactional Schedule Mutations & Review Races in Request V2
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\modules\request-v2\request-v2.service.ts`
- **Lines:** 305–375
- **Verbatim Source:**
```typescript
  async reviewRequest(
    id: string,
    reviewerId: string,
    action: 'APPROVE' | 'REJECT',
    note?: string
  ): Promise<SystemRequestDTO> {
    const req = await this.repo.findById(id);
    if (!req) {
      throw new Error(`Request with id '${id}' not found`);
    }

    if (action === 'APPROVE') {
      req.approve(reviewerId, note);

      if (this.attendanceRepo) {
        if (req.type === 'SHIFT_CHANGE') {
...
        } else if (req.type === 'LEAVE') {
          const start = req.leaveStartDate;
          const end = req.leaveEndDate || start;
          if (start) {
            let cur = new Date(`${start}T00:00:00.000Z`);
            const endDate = new Date(`${end}T00:00:00.000Z`);
            while (cur.getTime() <= endDate.getTime()) {
              const curStr = cur.toISOString().slice(0, 10);
              const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, curStr);
              await this.attendanceRepo.saveSchedule(sched.withLeave(req.id));
              cur = new Date(cur.getTime() + 86400000);
            }
          }
        }
      }
    } else if (action === 'REJECT') {
      req.reject(reviewerId, note);
    }
...
    await this.repo.save(req);
    return req.toJSON();
  }
```
- **Observed Behavior:**
  1. `reviewRequest` executes without a database transaction wrapper.
  2. In the `while` loop, each day's schedule modification is saved and committed independently via `this.attendanceRepo.saveSchedule`.
  3. If an error occurs on day N of a multi-day leave, the preceding days remain committed with status `ON_LEAVE`, while the request itself remains `PENDING`.
  4. Concurrent review requests for the same request ID race without advisory or row-level locks, permitting contradictory schedule updates.

---

### Category C: Pure Logic Verification, Redundancy & Data Corruption in V2

#### Observation C1: Date Range Formatting Logic Error `${month}-31` on PostgreSQL `DATE` Column
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\data\payroll-v2.repository.ts`
- **Lines:** 95–104
- **Verbatim Source:**
```typescript
    // Timesheet entries
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    const timesheetRows = await this.qb
      .selectFrom('timesheet_entries')
      .selectAll()
      .where('employee_id', '=', staffRow.uuid || employeeId)
      .where('work_date', '>=', startDate)
      .where('work_date', '<=', endDate)
      .orderBy('work_date', 'asc')
      .execute();
```
- **Companion Bug in UI-Bridge:** `src/modules/ui-bridge/ui-bridge.controller.ts:44–46`:
```typescript
      timesheets = await this.attendanceV2.listTimesheets({
        employeeId: staff.uuid || who,
        startDate: `${month}-01`,
        endDate: `${month}-31`
      });
```
- **Companion Bug in Service Consumer:** `src/domain/payroll-v2/payroll-v2-service.ts:14–23`:
```typescript
    const summaries: EmployeePayslipSummaryDTO[] = [];
    for (const empId of targets) {
      try {
        const payslip = await this.generateMonthlyPayslip(empId, month);
        summaries.push(payslip.toSummary());
      } catch {
        // Skip records that cannot be calculated
      }
    }
    return summaries;
```
- **Database Schema Definition:** `migrations/postgres/0001_baseline.sql:287`:
```sql
CREATE TABLE timesheet_entries (
    id UUID PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES staff(uuid),
    work_date DATE NOT NULL,
```
- **Observed Behavior:**
  1. `work_date` is a PostgreSQL `DATE` column.
  2. In months with fewer than 31 days (February, April, June, September, November), passing `${month}-31` causes PostgreSQL to throw:
     `ERROR: date/time field value out of range: "YYYY-MM-31"`
  3. In `PayrollV2Service.generatePeriodPayslips`, the `catch {}` block at line 19 silently catches and swallows this error without logging.
  4. For all 5 months with < 31 days, `generatePeriodPayslips` returns `items: []`, causing complete calculation failure across the entire organization.

#### Observation C2: Unbounded Lifetime Query in Payroll V2 Overtime & Advance Deduction
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\data\payroll-v2.repository.ts`
- **Lines:** 107–113
- **Verbatim Source:**
```typescript
    // Requests
    const requestRows = await this.qb
      .selectFrom('system_requests')
      .selectAll()
      .where('employee_id', '=', staffRow.uuid || employeeId)
      .where('status', '=', 'APPROVED')
      .execute();
```
- **Companion Logic in Service:** `src/domain/payroll-v2/payroll-v2-service.ts:107–121`:
```typescript
    // Overtime from approved requests
    let totalOtHours = 0;
    for (const req of requests) {
      if (req.type === 'OVERTIME' && req.status === 'APPROVED') {
        totalOtHours += req.otHours || 0;
      }
    }

    // Advance deduction from approved requests
    let advanceDeduction = 0;
    for (const req of requests) {
      if (req.type === 'ADVANCE' && req.status === 'APPROVED') {
        advanceDeduction += Number(req.advanceAmount || 0);
      }
    }
```
- **Observed Behavior:**
  1. `getMonthlyData` queries `system_requests` filtering solely by `status = 'APPROVED'` and `employee_id`. It does not filter by month, date, or period.
  2. `generateMonthlyPayslip` iterates over all returned requests and sums `req.otHours` and `req.advanceAmount` without checking `req.otDate` or `req.advancePeriod`.
  3. Every approved OT request and every salary advance from all previous months and years are permanently re-applied and cumulated on every subsequent monthly payslip.

#### Observation C3: Total Unreachability of `PayrollV2Controller` via Missing Route Policy
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\platform\authz.ts`
- **Lines:** 310–330, 364
- **Verbatim Source:**
```typescript
function routeKey(method?, seg?) {
  if (seg[1] === 'v2' && seg[2] === 'employees') {
...
  }
  if (seg[1] === 'v2' && seg[2] === 'requests') {
...
  }
  if (seg[1] === 'v2' && seg[2] === 'attendance') {
...
  }
...
  return `${method} /${seg.slice(1, 3).join('/')}`;
}
```
- **Context Lines:** `src/http/api-gate.ts:54–58`:
```typescript
    // Route không có trong ROUTE_CAPS bị từ chối mặc định; thiếu năng lực thì 403 trước khi đọc thân yêu cầu.
    const policy = this.authz.policyOf(this.authz.routeKey(method, seg));
    if (!policy) {
      need();
      throw new HttpError(403, 'Đường dẫn này chưa có chính sách quyền, bị từ chối', { code: 'NO_ROUTE_POLICY' });
    }
```
- **Observed Behavior:**
  1. `routeKey` has branches for `v2/employees`, `v2/requests`, and `v2/attendance`, but completely omits `v2/payroll`.
  2. Calls to `/api/v2/payroll/...` evaluate to `${method} /v2/payroll`.
  3. Neither `GET /v2/payroll` nor `POST /v2/payroll` exists in `ROUTE_CAPS`.
  4. `ApiGate.open` line 57 unconditionally throws `HttpError(403, 'Đường dẫn này chưa có chính sách quyền, bị từ chối', { code: 'NO_ROUTE_POLICY' })` on every endpoint in `PayrollV2Controller`.

#### Observation C4: Broken Authorization & Privilege Escalation in `RequestV2Controller`
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\modules\request-v2\request-v2.controller.ts`
- **Lines:** 16–20, 32–36, 48–52, 64–68, 80–84, 134–135, 151–152
- **Verbatim Source:**
```typescript
  @Post('leave')
  async createLeave(@Ctx() c: ApiContext): Promise<unknown> {
    const body = (await readJson(c.req)) || {};
    try {
      const employeeId = body.employeeId || c.me?.uuid || c.me?.username;
      const request = await this.service.createLeaveRequest({
        ...body,
        employeeId
      });
...
  @Patch(':id/review')
  async reviewRequest(@Ctx() c: ApiContext, @Param('id') paramId?: string): Promise<unknown> {
    const id = paramId || c.seg[3];
    const body = (await readJson(c.req)) || {};
    try {
      const reviewerId = body.reviewerId || c.me?.uuid || c.me?.username || 'system';
      const request = await this.service.reviewRequest(id, reviewerId, body.action, body.note);
```
- **Observed Behavior:**
  1. Creation endpoints accept `body.employeeId` from the caller without verifying that it matches the authenticated user `c.me`. Any user can submit requests on behalf of other employees.
  2. `reviewRequest` accepts `body.reviewerId` directly from the client, allowing spoofing of the reviewer identity in the audit trail.

#### Observation C5: Fake / Dummy Stub Handlers in `UiBridgeController`
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\modules\ui-bridge\ui-bridge.controller.ts`
- **Lines:** 123–137, 191–206
- **Verbatim Source:**
```typescript
  @Put('sheet/bulk')
  async putSheetBulk(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, needAdmin } = c;
    needAdmin();
    const body = (await readJson(req)) || {};
    return { ok: true, updated: (body.usernames || []).length };
  }

  @Put('staff/shift-bulk')
  async putStaffShiftBulk(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, needAdmin } = c;
    needAdmin();
    const body = (await readJson(req)) || {};
    return { ok: true, shiftCode: body.preset || 'normal', updated: body.usernames || [] };
  }
...
  @Get('today')
  async getToday(@Ctx() c: ApiContext): Promise<unknown> {
    const { needAdmin } = c;
    needAdmin();
    const today = this.rules.vnToday();
    const people = (await this.store.listStaff()).filter((s: any) => s.payrollSubject);
    const rows = people.map((s: any) => ({
      username: s.username,
      name: s.name,
      status: 'checked-out',
      shift: s.shiftCode || 'normal',
      in: null,
      out: null
    }));
    return { today, rows };
  }
```
- **Observed Behavior:**
  1. `PUT /api/sheet/bulk` and `PUT /api/staff/shift-bulk` perform zero database writes, calling no repository or service methods, while returning `{ ok: true }` to the client.
  2. `GET /api/today` returns hardcoded dummy statuses (`status: 'checked-out'`, `in: null`, `out: null`) for all employees without querying any punch or timesheet tables.

---

### Category D: Dead Code, Superfluous Wrappers & Abandoned Subsystems

#### Observation D1: Abandoned Dynamic Attributes Engine
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\params\attributes.ts`
- **Lines:** 1–295
- **Companion Code:** `src/engine/pay-tail-calc.ts:46, 52–57`:
```typescript
  const UNAVAILABLE = Object.freeze({
...
    'insurance.base': Object.freeze(['insuranceAttr']),
```
```typescript
    for (const [key, values] of Object.entries<any>(UNAVAILABLE))
      if (Object.hasOwn(P, key) && values.includes(P[key]))
        throw tailError(
          `Tham số ${key}: phương án này chưa dùng được (chờ chủ dự án, kế toán hoặc pháp chế chốt)`,
          'PARAM_OPTION_UNAVAILABLE',
          key
        );
```
- **Observed Behavior:**
  1. `src/params/attributes.ts` is 295 lines of complex validation and classification logic for dynamic level attributes (`class.level.attr.*` and `level.*.*.attr.*`).
  2. In production payroll execution, `assertAvailable(P)` unconditionally rejects `insuranceAttr` with `PARAM_OPTION_UNAVAILABLE`.
  3. The subsystem is completely disabled in business execution but remains wired into `validate.ts`, `save.ts`, `store.ts`, `payroll-params.ts`, and `pay-tail-calc.ts`.

#### Observation D2: Orphaned `seed-data.ts` in Position Domain
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\domain\position\seed-data.ts`
- **Lines:** 1–38
- **Observed Behavior:**
  1. Exports `TYPE_NAMES`, `LEVEL_NAMES`, `SHIFTS`.
  2. Grep search across `src/` confirms 0 imports in application code (only mentioned inside an explanatory comment in `src/engine/punch.ts:32`).
  3. Database initialization was moved to `migrations/postgres/0002_seed.sql`.

#### Observation D3: Orphaned `attendance-status.ts` in Engine
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\engine\attendance-status.ts`
- **Lines:** 1–62
- **Observed Behavior:**
  1. Contains 62 lines defining `AttendanceStatus` (`LABEL`, `DAY_ORDER`, `TONE`, `statusOf`, `dayStatus`, etc.).
  2. Grep search confirms 0 imports across all `src/` controllers, services, repositories, or engines.

#### Observation D4: Superfluous 3-Line Passthrough Wrapper `payroll-service.ts`
- **File:** `C:\Users\52.AI UD\Project\Vladilena-Milize\src\domain\payroll\payroll-service.ts`
- **Lines:** 1–3
- **Verbatim Source:**
```typescript
'use strict';
module.exports = require('../../params/payroll-preview');
```
- **Observed Behavior:**
  1. Acts strictly as an indirect alias forwarding to `src/params/payroll-preview.ts`.
  2. Holds no business logic or domain modeling, reflecting incomplete G4 domain extraction debt.

---

## 2. Logic Chain

The step-by-step reasoning connecting observations to systematic failure modes:

1. **Step 1 (Background Failure Mode):**
   - Observation A1 demonstrates `setInterval(run, intervalMs)` executing `() => this.refreshAll()`.
   - Because `refreshAll` is async and does not handle errors from `this.store.listStaff()`, any database connectivity failure during background refresh triggers an unhandled promise rejection.
   - Because `refreshAll` acquires no lock (Observation B1/Context), multiple intervals running concurrently (or across multiple processes) simultaneously execute `this.ledger.sync` and `this.ledger.saveBalance`, creating concurrent delete/upsert races in `leave_ledger`.

2. **Step 2 (Resource Exhaustion Mode):**
   - Observations A3 and A4 demonstrate that the connection pool is capped at 10 connections with no timeout, while `heartbeat()` launches up to `N` sequential queries every 25 seconds for `N` connected clients.
   - When combined with long-running transactions (such as Observation B2's batch `calculate` which holds a connection across an entire staff loop), the 10 connections are easily occupied.
   - Subsequent HTTP requests block indefinitely in the `pg` pool queue, resulting in server-wide unresponsiveness.

3. **Step 3 (V2 Payroll Data Corruption Mode):**
   - Observation C1 shows `PayrollV2Repository.getMonthlyData` constructing `endDate = '${month}-31'`.
   - In PostgreSQL, querying `work_date <= '2026-02-31'` throws `date/time field value out of range`.
   - Because `PayrollV2Service.generatePeriodPayslips` wraps calculation in an empty `catch {}` block, every employee calculation for February, April, June, September, and November fails silently.
   - Furthermore, Observation C2 shows `getMonthlyData` querying `system_requests` with `WHERE status = 'APPROVED'` without month criteria, while `generateMonthlyPayslip` sums all returned items. Every approved overtime and salary advance in an employee's lifetime is erroneously summed and applied to each month's payslip.

4. **Step 4 (API Security & Availability Block Mode):**
   - Observation C3 shows that `routeKey()` lacks a mapping for `v2/payroll`, falling back to `${method} /v2/payroll`.
   - `ROUTE_CAPS` contains no policy for `/v2/payroll`.
   - `ApiGate.open` rejects any unmapped route with 403 `NO_ROUTE_POLICY`. Consequently, no client can reach `PayrollV2Controller`.
   - Observation C4 shows that in `RequestV2Controller`, user inputs for `employeeId` and `reviewerId` are taken directly from the request body without identity checking, permitting unauthorized request creation and approval spoofing.

5. **Step 5 (Dead Code & Fake Stubs Mode):**
   - Observation C5 proves that `PUT /api/sheet/bulk` and `PUT /api/staff/shift-bulk` return `{ ok: true }` without writing to the database, giving clients a false sense of persistence.
   - Observations D1–D4 prove that hundreds of lines of legacy code (`attributes.ts`, `seed-data.ts`, `attendance-status.ts`, `payroll-service.ts`, and `punch_requests` purge loop) persist in the repository despite serving no operational purpose.

---

## 3. Caveats

1. **Production Runtime Telemetry:** Investigation was performed via static source code logic analysis without connecting to a live PostgreSQL production instance or reading user production data.
2. **External Reverse Proxy Timeouts:** Upstream proxies (e.g., Nginx, Caddy, AWS ALB) might enforce their own socket timeouts (e.g., 60 seconds), which would terminate hanging pool connection requests with 504 Gateway Timeout rather than hanging indefinitely.
3. **Alternative Client Implementations:** If a mobile client or frontend directly invokes internal domain services rather than HTTP endpoints, the `ROUTE_CAPS` 403 block on `PayrollV2Controller` would affect only HTTP consumers.

---

## 4. Conclusion

1. **Critical Background Execution Risks:**
   - Background tasks in `LeaveAccountService` and `main.ts` lack idempotency, lack distributed locking, and run with unhandled promise rejections.
   - The PostgreSQL connection pool is critically undersized (`max: 10`) with zero timeout configuration, vulnerable to starvation from SSE heartbeat query storms and long-running batch transactions.
2. **Catastrophic V2 Payroll Logic Defects:**
   - Hardcoding `${month}-31` breaks payroll calculations across 5 out of 12 calendar months due to PostgreSQL `DATE` casting errors, silently discarded by empty `catch` blocks.
   - Overtime and salary advance queries omit date filtering, compounding historical requests across an employee's entire tenure into single-month calculations.
3. **Dead Code & Broken Compatibility:**
   - `PayrollV2Controller` is 100% unreachable due to missing routing policy in `ApiGate`.
   - `UiBridgeController` contains fake stubs for bulk sheet and shift updates that return success without persisting state.
   - Multiple orphaned files (`attributes.ts`, `seed-data.ts`, `attendance-status.ts`) and dead purge loops remain in the repository.

---

## 5. Verification Method

To independently verify all findings without modifying application code or relying on test suites:

1. **Inspect Date Range Crash in PostgreSQL:**
   Execute in PostgreSQL:
   ```sql
   SELECT * FROM timesheet_entries WHERE work_date <= '2026-02-31';
   ```
   *Expected result:* `ERROR: date/time field value out of range: "2026-02-31"`.
   Verify in `src/data/payroll-v2.repository.ts:96` and `src/domain/payroll-v2/payroll-v2-service.ts:19-21`.

2. **Inspect Route Policy Rejection on Payroll V2:**
   Inspect `src/platform/authz.ts:310-365` and `src/platform/authz.ts:280-306`.
   Note the complete absence of `v2/payroll`.
   Inspect `src/http/api-gate.ts:54-58` to confirm that any route without policy throws `HttpError(403, '...', { code: 'NO_ROUTE_POLICY' })`.

3. **Inspect Lifetime Request Accumulation in Payroll V2:**
   Inspect `src/data/payroll-v2.repository.ts:107-112`. Confirm `system_requests` query contains no date or period condition.
   Inspect `src/domain/payroll-v2/payroll-v2-service.ts:109-121`. Confirm loop sums `req.otHours` and `req.advanceAmount` without checking dates.

4. **Inspect Floating Promise in Background Scheduler:**
   Inspect `src/domain/leave/leave-account-service.ts:84-86`. Confirm `const run = () => this.refreshAll(); setInterval(run, intervalMs);` lacks `.catch(...)` or `try/catch`.

5. **Inspect Fake Stubs in UI-Bridge:**
   Inspect `src/modules/ui-bridge/ui-bridge.controller.ts:123-137`. Confirm `putSheetBulk` and `putStaffShiftBulk` return `{ ok: true }` immediately without invoking any store or repository method.
