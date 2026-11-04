# Concurrency, Race Conditions & Advisory Locks Audit Report

## 1. Observation

Direct code inspections of the Vladilena-Milize implementation codebase revealed multiple critical concurrency flaws, transaction boundary violations, and race conditions across the V2 domain aggregates, legacy compatibility layers, database access drivers, and background execution mechanisms.

---

### Finding 1.1: Advisory Lock Scope Mismatch and Auto-Commit Release
- **Target File**: `src/data/locks.ts`, lines 9–15
- **Related Files**: `src/platform/db.ts` (lines 48, 1112), `src/data/postgres-database.ts` (lines 264–298), `src/data/db-dialect.ts` (lines 28–66)
- **Verbatim Code Snippet (`src/data/locks.ts:9-15`)**:
```typescript
export class AdvisoryLocks {
  constructor(private readonly qb: Kysely<Schema>) {}

  async acquire(key: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(this.qb);
  }
}
```
- **Verbatim Code Snippet (`src/platform/db.ts:48, 1111-1112`)**:
```typescript
const locks = new AdvisoryLocks(queryBuilder);
...
  // Khoá tư vấn theo khoá nghiệp vụ tới hết giao dịch (xem src/data/locks.ts): gọi đầu giao dịch "đọc rồi mới chèn"
  lock: (key?) => locks.acquire(key),
```
- **Verbatim Code Snippet (`src/data/postgres-database.ts:277-279`)**:
```typescript
  query(text?, params?) {
    return (this.store.getStore() || this.pool).query(text, params);
  }
```
- **Technical Explanation**:
  `AdvisoryLocks.acquire` executes `pg_advisory_xact_lock(hashtextextended(${key}, 0))` on `this.qb`. When called through the exported `store.lock(key)`, if the caller is not already inside an active `store.transaction()`, `this.store.getStore()` in `PoolDriver` evaluates to `undefined`. Consequently, `this.pool.query(...)` executes the query as a standalone statement against the `pg.Pool`. In PostgreSQL, `pg_advisory_xact_lock` creates a transaction-scoped advisory lock that automatically releases at transaction end. Because `pool.query()` executes within its own single-statement autocommit transaction, the advisory lock is acquired and **immediately released upon statement completion**. Any subsequent application logic intended to be serialized executes completely unprotected. Furthermore, `AdvisoryLocks` lacks any assertion guarding against invocation outside an active transaction context.

---

### Finding 1.2: Complete Omission of Advisory and Row-Level Locks Across All V2 Aggregates
- **Target Files**:
  * `src/modules/request-v2/request-v2.service.ts` (lines 108–410)
  * `src/modules/attendance-v2/attendance-v2.service.ts` (lines 48–188)
  * `src/domain/payroll-v2/payroll-v2-service.ts` (lines 4–158)
  * `src/modules/employee-v2/employee-v2.service.ts` (lines 14–260)
- **Verbatim Code Snippet (`src/modules/request-v2/request-v2.service.ts:111-123`)**:
```typescript
  constructor(
    @Optional() @Inject(RequestV2Repository) repo?: RequestV2Repository,
    @Optional() @Inject(AttendanceV2Repository) private readonly attendanceRepo?: AttendanceV2Repository,
    @Optional() @Inject(STORE) private readonly store?: any
  ) {
    if (repo) {
      this.repo = repo;
    } else if (this.store?.queryBuilder) {
      this.repo = new RequestV2Repository(this.store.queryBuilder);
    } else {
      this.repo = new RequestV2Repository({} as any);
    }
  }
```
- **Technical Explanation**:
  While remediation design documents proposed structured advisory locking (`src/data/v2-write-context.ts`, `acquireShared('v2:attendance-periods')`, `acquire('v2:employee:' + uuid)`), the actual implemented V2 codebase contains **zero advisory locks, zero `SELECT ... FOR UPDATE` row locks, and zero transaction wrappers**. All V2 repositories instantiate against raw `Kysely<Schema>` connections and execute queries in standalone autocommit mode.

---

### Finding 1.3: Request V2 Approval Interleaving and Orphaned Schedule Side Effects
- **Target File**: `src/modules/request-v2/request-v2.service.ts`, lines 305–376
- **Verbatim Code Snippet (`src/modules/request-v2/request-v2.service.ts:305-376`)**:
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
          const date = req.leaveStartDate || req.correctionDate || '';
          if (date) {
            const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, date);
            const updated = sched.withShiftChange(req.newShiftType as any, req.newStartTime!, req.newEndTime!, req.id);
            await this.attendanceRepo.saveSchedule(updated);
          }
        } else if (req.type === 'LEAVE_WITH_MAKEUP') {
          const leaveDate = req.leaveStartDate;
          const makeupDate = req.leaveEndDate;
          if (leaveDate) {
            const leaveSched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, leaveDate);
            await this.attendanceRepo.saveSchedule(leaveSched.withLeave(req.id));
          }
          if (makeupDate) {
            const makeupSched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, makeupDate);
            const updated = makeupSched.withMakeUp(req.makeupStartTime!, req.makeupEndTime!, req.id);
            await this.attendanceRepo.saveSchedule(updated);
          }
        } else if (req.type === 'OVERTIME') {
          const date = req.otDate;
          if (date) {
            const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, date);
            const extendedEnd = req.otEndTime || sched.plannedEndTime;
            const hours = req.otHours || 0;
            const updated = sched.withOvertime(extendedEnd, hours, req.id);
            await this.attendanceRepo.saveSchedule(updated);
          }
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
        } else if (req.type === 'EXPLANATION') {
          const workDate = req.correctionDate;
          if (workDate) {
            await this.attendanceRepo.updateDayStatus(req.employeeId, workDate, 'VALID');
          }
        }
      }
    } else if (action === 'REJECT') {
      req.reject(reviewerId, note);
    } else {
      throw new Error(`Invalid review action '${action}'; must be 'APPROVE' or 'REJECT'`);
    }

    await this.repo.save(req);
    return req.toJSON();
  }
```
- **Technical Explanation & Interleaving Sequence**:
  The method `reviewRequest` operates completely outside a database transaction and performs non-atomic updates across multiple distinct tables (`work_schedules`, `timesheet_entries`, and `system_requests`).
  Consider two concurrent requests on the same `PENDING` request:
  1. **T0**: Request `req` has `status = 'PENDING'`.
  2. **T1 (Manager A - APPROVE)**: Fetches `req` via `findById(id)`. Status is `'PENDING'`.
  3. **T2 (Manager B - REJECT)**: Fetches `req` via `findById(id)`. Status is `'PENDING'`.
  4. **T3 (Manager A)**: Mutates attendance schedule records in PostgreSQL via `this.attendanceRepo.saveSchedule(sched.withLeave(req.id))`. Schedules now record approved leave referencing `req.id`.
  5. **T4 (Manager B)**: Executes `req.reject(...)` and calls `this.repo.save(req)`. PostgreSQL updates `system_requests` to `status = 'REJECTED'`.
  6. **T5 (Manager A)**: Calls `this.repo.save(req)`.
     - *If Manager A executes T5 after Manager B*: Manager A overwrites `system_requests` with `status = 'APPROVED'`. Both managers receive success responses without any conflict detection (missing revision/version check).
     - *If Manager B executes save after Manager A*: `system_requests` is committed as `REJECTED`, yet the side-effects in `work_schedules` remain permanently committed as `withLeave(req.id)`. The system enters a corrupted state where `work_schedules` points to a rejected request as authorized leave.

---

### Finding 1.4: Multi-Day Schedule Injection Partial Failure (Non-Atomic Loop)
- **Target File**: `src/modules/request-v2/request-v2.service.ts`, lines 348–360
- **Verbatim Code Snippet (`src/modules/request-v2/request-v2.service.ts:348-360`)**:
```typescript
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
```
- **Technical Explanation**:
  The `while` loop iterates day-by-day across the leave date span, issuing separate `ensureDefaultSchedule` and `saveSchedule` queries without an enclosing database transaction. If an error, database timeout, or server restart occurs on day 5 of a 10-day leave request:
  - Days 1 through 4 remain committed in `work_schedules` as approved leave.
  - Days 5 through 10 are never created.
  - `this.repo.save(req)` is never reached, leaving `system_requests.status` as `'PENDING'`.
  - Re-evaluating or retrying the request will re-process the loop or collide, leaving inconsistent attendance records across the schedule range.

---

### Finding 1.5: TOCTOU Race Condition in Concurrent Leave Creation
- **Target File**: `src/modules/request-v2/request-v2.service.ts`, lines 136–154
- **Verbatim Code Snippet (`src/modules/request-v2/request-v2.service.ts:136-154`)**:
```typescript
    // Chống trùng lặp thời gian nghỉ phép với các đơn đang chờ hoặc đã duyệt
    const existingLeaves = await this.repo.list({
      employeeId: input.employeeId,
      type: 'LEAVE'
    });
    const start = req.leaveStartDate!;
    const end = req.leaveEndDate!;
    for (const item of existingLeaves) {
      if (item.status === 'PENDING' || item.status === 'APPROVED') {
        const itemStart = item.leaveStartDate!;
        const itemEnd = item.leaveEndDate || itemStart;
        if (start <= itemEnd && end >= itemStart) {
          throw new Error(`Đã có đơn nghỉ phép trùng trong khoảng thời gian ${start} đến ${end}`);
        }
      }
    }

    await this.repo.save(req);
    return req.toJSON();
```
- **Technical Explanation**:
  The overlap check query `this.repo.list(...)` is a non-locking `SELECT`. If an employee issues two rapid concurrent submissions (or submits from two browser tabs) for the identical leave date window:
  1. Thread 1 queries `existingLeaves` -> empty.
  2. Thread 2 queries `existingLeaves` -> empty.
  3. Thread 1 validates overlap check (passes) and executes `await this.repo.save(req)`.
  4. Thread 2 validates overlap check (passes) and executes `await this.repo.save(req)`.
  Because the underlying table `system_requests` has no PostgreSQL range exclusion constraint (`EXCLUDE USING gist`) or partial unique index on date ranges (`migrations/postgres/0001_baseline.sql:221-251`), both overlapping requests are inserted into the database.

---

### Finding 1.6: In-Flight Punch Overwriting Locked Payroll Period Timesheet
- **Target Files**:
  * `src/modules/attendance-v2/attendance-v2.service.ts`, lines 99–104, 160–166
  * `src/data/attendance-v2.repository.ts`, lines 71–120, 280–291
- **Verbatim Code Snippet (`src/modules/attendance-v2/attendance-v2.service.ts:99-103, 160-161`)**:
```typescript
    // 3. Kiểm tra xem ngày công đã bị khóa chưa
    let timesheet = await this.repo.findTimesheet(input.employeeId, workDate);
    if (timesheet && timesheet.isLocked) {
      throw new Error('Bảng công ngày đã bị khóa cho kỳ lương, không thể tính toán lại');
    }
...
    timesheet = timesheet.calculate(punches, schedule);
    await this.repo.saveTimesheet(timesheet);
```
- **Verbatim Code Snippet (`src/data/attendance-v2.repository.ts:99-119`)**:
```typescript
      .onConflict(oc =>
        oc.columns(['employee_id', 'work_date']).doUpdateSet(eb => ({
          shift_type: eb.ref('excluded.shift_type'),
          shift_start_time: eb.ref('excluded.shift_start_time'),
          shift_end_time: eb.ref('excluded.shift_end_time'),
          shift_allowance_pct: eb.ref('excluded.shift_allowance_pct'),
          actual_check_in: eb.ref('excluded.actual_check_in'),
          actual_check_out: eb.ref('excluded.actual_check_out'),
          work_hours: eb.ref('excluded.work_hours'),
          work_units: eb.ref('excluded.work_units'),
          ot_hours: eb.ref('excluded.ot_hours'),
          late_minutes: eb.ref('excluded.late_minutes'),
          early_minutes: eb.ref('excluded.early_minutes'),
          status: eb.ref('excluded.status'),
          is_locked: eb.ref('excluded.is_locked'),
          check_in_status: eb.ref('excluded.check_in_status'),
          check_out_status: eb.ref('excluded.check_out_status'),
          day_status: eb.ref('excluded.day_status'),
          updated_at: now
        }))
      )
```
- **Technical Explanation & Interleaving Sequence**:
  1. **T0**: Employee punch arrives for `workDate`. `timesheet` is loaded from DB with `is_locked = false`.
  2. **T1**: Payroll administrator locks the attendance period via `AttendanceV2Repository.lockTimesheets`, which runs `UPDATE timesheet_entries SET is_locked = true ...`. The row in PostgreSQL now has `is_locked = true`.
  3. **T2**: The punch processing thread finishes recalculation with in-memory `timesheet.isLocked == false` and invokes `saveTimesheet(timesheet)`.
  4. **T3**: `saveTimesheet` executes an `UPSERT` where the `DO UPDATE` clause unconditionally writes `is_locked: eb.ref('excluded.is_locked')`.
  5. The row in PostgreSQL has its `is_locked` flag overwritten from `true` back to `false`, silently unlocking a finalized period's timesheet entry and corrupting payroll auditability.

---

### Finding 1.7: Overwriting Approved Schedules with Default Schedules via `ensureDefaultSchedule`
- **Target Files**:
  * `src/data/attendance-v2.repository.ts`, lines 296–328, 392–418
  * `src/modules/attendance-v2/attendance-v2.service.ts`, lines 78–92
- **Verbatim Code Snippet (`src/data/attendance-v2.repository.ts:392-418`)**:
```typescript
  async ensureDefaultSchedule(employeeId: string, workDate: string): Promise<WorkSchedule> {
    const existing = await this.findSchedule(employeeId, workDate);
    if (existing) return existing;

    const staffRow = await this.qb
      .selectFrom('staff')
      .select(['uuid', 'shift_type', 'shift_start_time', 'shift_end_time'])
      .where('uuid', '=', employeeId)
      .executeTakeFirst();

    const shiftType = (staffRow?.shift_type as any) || 'NORMAL';
    const plannedStartTime = staffRow?.shift_start_time || '08:00';
    const plannedEndTime = staffRow?.shift_end_time || '17:00';

    const defaultSchedule = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType,
      plannedStartTime,
      plannedEndTime,
      scheduleType: 'REGULAR',
      status: 'PLANNED'
    });

    await this.saveSchedule(defaultSchedule);
    return defaultSchedule;
  }
```
- **Verbatim Code Snippet (`src/data/attendance-v2.repository.ts:315-325`)**:
```typescript
      .onConflict(oc =>
        oc.columns(['employee_id', 'work_date']).doUpdateSet(eb => ({
          shift_type: eb.ref('excluded.shift_type'),
          planned_start_time: eb.ref('excluded.planned_start_time'),
          planned_end_time: eb.ref('excluded.planned_end_time'),
          approved_ot_hours: eb.ref('excluded.approved_ot_hours'),
          schedule_type: eb.ref('excluded.schedule_type'),
          status: eb.ref('excluded.status'),
          source_request_id: eb.ref('excluded.source_request_id'),
          updated_at: now
        }))
      )
```
- **Technical Explanation**:
  `ensureDefaultSchedule` performs a non-atomic check: `findSchedule` followed by `saveSchedule`.
  If an approver approves an overtime or shift change request simultaneously with an employee punch ingestion:
  1. Thread A (Punch): `findSchedule` returns `null`. Thread A begins preparing `defaultSchedule` (`status: 'PLANNED', approved_ot_hours: 0`).
  2. Thread B (Overtime Approval): Calls `ensureDefaultSchedule`, modifies the schedule with `withOvertime(...)`, setting `status: 'OVERTIME', approved_ot_hours: 3`, and commits it via `saveSchedule`.
  3. Thread A (Punch): Now executes `saveSchedule(defaultSchedule)`. The `ON CONFLICT (employee_id, work_date)` clause overwrites `status` back to `'PLANNED'` and `approved_ot_hours` back to `0`.
  The approved overtime configuration on the employee's work schedule is completely erased.

---

### Finding 1.8: Non-Atomic Payroll V2 Generation and Silent Error Masking
- **Target File**: `src/domain/payroll-v2/payroll-v2-service.ts`, lines 7–24
- **Verbatim Code Snippet (`src/domain/payroll-v2/payroll-v2-service.ts:7-24`)**:
```typescript
  async generatePeriodPayslips(month: string, employeeIds?: string[]): Promise<EmployeePayslipSummaryDTO[]> {
    let targets = employeeIds;
    if (!targets || targets.length === 0) {
      const staffList = await this.repo.listEligibleEmployees();
      targets = staffList.map(s => s.uuid);
    }

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
  }
```
- **Technical Explanation**:
  `generatePeriodPayslips` iterates over all eligible employees without opening a transaction, without locking the period, and without a repeatable-read snapshot.
  1. Each employee's data is queried via 5 independent autocommit queries in `getMonthlyData` (`staff`, `position_levels`, `timesheet_entries`, `system_requests`, `kpi_scores`).
  2. Because the loop executes over many seconds without isolation, employees processed at the beginning of the batch see a different state of requests and timesheets than employees processed at the end of the batch.
  3. If any transient database error, deadlock, or lock contention occurs for an employee, `catch { // Skip records that cannot be calculated }` silently drops that employee from the returned summary without raising an error or aborting the batch, leading to incomplete payroll reports.

---

### Finding 1.9: Concurrent Audit Log Writes Inducing Primary Key Collisions
- **Target Files**:
  * `src/platform/db.ts`, lines 453–460
  * `src/data/audit-log.repository.ts`, lines 40–46
- **Verbatim Code Snippet (`src/platform/db.ts:453-460`)**:
```typescript
    return await transaction(async () => {
      const last = await auditRepo.last();
      const row: Record<string, any> = { id: last ? last.id + 1 : 1, prev_hash: last ? last.hash : '', ...fields };
      const key = auditKey();
      row.hash = auditHash(row, key ? 'hmac-sha256' : 'sha256', key);
      await auditRepo.insert({ ...row, subject_uuid: subjectUuid, actor_uuid: actorUuid });
      return { id: row.id, hash: row.hash };
    });
```
- **Verbatim Code Snippet (`src/data/audit-log.repository.ts:40-42`)**:
```typescript
  async last(): Promise<{ id: number; hash: string } | undefined> {
    return this.qb.selectFrom('audit_log').select(['id', 'hash']).orderBy('id', 'desc').limit(1).executeTakeFirst();
  }
```
- **Technical Explanation**:
  Audit log primary keys are calculated in Node.js application memory as `id: last ? last.id + 1 : 1` based on a plain `SELECT ... ORDER BY id DESC LIMIT 1` (no `FOR UPDATE`, no advisory lock, no sequence).
  When two concurrent business operations (e.g., two approvals, or two punches) write an audit log entry:
  1. Transaction A reads `last.id = 500`.
  2. Transaction B reads `last.id = 500`.
  3. Transaction A sets `row.id = 501` and inserts.
  4. Transaction B sets `row.id = 501` and inserts.
  5. Transaction B throws a primary key unique constraint violation (`23505`).
  Because `auditStore.write` runs **inside** the enclosing business transaction (`store.transaction`), Transaction B's **entire business operation is rolled back**, causing an unhandled 500 error for normal concurrent user operations.

---

### Finding 1.10: Unique Constraint Violation on Concurrent Payroll Run Calculations
- **Target Files**:
  * `src/data/payroll.repository.ts`, lines 61–73
  * `src/platform/db.ts`, lines 884–903
  * `migrations/postgres/0001_baseline.sql`, line 110
- **Verbatim Code Snippet (`src/data/payroll.repository.ts:61-73`)**:
```typescript
  async nextRunNo(month: string): Promise<number> {
    const row = await this.qb
      .selectFrom('payroll_runs')
      .select(sql<number>`COALESCE(MAX(run_no), 0) + 1`.as('n'))
      .where('month', '=', month)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async insert(row: Insertable<Schema['payroll_runs']>): Promise<number> {
    const result = await this.qb.insertInto('payroll_runs').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }
```
- **Verbatim Code Snippet (`migrations/postgres/0001_baseline.sql:110`)**:
```sql
    UNIQUE (month, run_no)
```
- **Technical Explanation**:
  `createRun` calculates `run_no` via `nextRunNo(month)`, which queries `COALESCE(MAX(run_no), 0) + 1`. There is no advisory lock on the calculation or period. When two administrators trigger payroll calculation for month `2026-11` simultaneously:
  1. Both transactions read `nextRunNo('2026-11')` and receive `1`.
  2. Tx 1 inserts `(month: '2026-11', run_no: 1)` successfully.
  3. Tx 2 attempts to insert `(month: '2026-11', run_no: 1)` and crashes with PostgreSQL error `23505 (unique_violation: UNIQUE (month, run_no))`.

---

### Finding 1.11: Synchronous Compression Blocking the Event Loop Inside Database Transactions
- **Target Files**:
  * `src/domain/period/periods.ts`, lines 349–384
  * `src/platform/db.ts`, lines 850–870, 918–930
- **Verbatim Code Snippet (`src/domain/period/periods.ts:352-368`)**:
```typescript
  return await store.transaction(async () => {
    const inputs = await service.loadInputs(month);
    const run = await store.payroll.createRun(month, { ... });
    let errors = 0;
    for (const [, person] of inputs.people) {
      const slip = slipOf(month, person.staff, inputs, resolved.params);
      if (slip.status === 'error') errors++;
      await store.payroll.addPayslip(run.id, slip);
    }
```
- **Verbatim Code Snippet (`src/platform/db.ts:936-937`)**:
```typescript
    const snapshotGz = zlib.gzipSync(Buffer.from(JSON.stringify(p.snapshot), 'utf8'));
```
- **Technical Explanation**:
  Inside `store.transaction`, the payroll calculation loops over every employee in the company. For each employee, `addPayslip` invokes `zlib.gzipSync(...)` to compress the payroll snapshot synchronously.
  1. `zlib.gzipSync` is CPU-bound and blocks Node.js's single-threaded event loop for the duration of the compression.
  2. The dedicated PostgreSQL connection borrowed from `pg.Pool` (default size: 10 connections) is held open in an uncommitted transaction across hundreds or thousands of synchronous compression cycles.
  3. This causes rapid database connection pool exhaustion and stalls all incoming HTTP requests on the Node.js server.

---

### Finding 1.12: Process-Local Cache Invalidation Counter in Multi-Replica Deployments
- **Target Files**:
  * `src/ops/compute-cache.ts`, lines 37–52
  * `src/ops/shared-cache.ts`, lines 6–10
  * `src/data/postgres-database.ts`, lines 21, 38–40, 180–182
- **Verbatim Code Snippet (`src/ops/shared-cache.ts:6-10`)**:
```typescript
// Số lần ghi đã chạy qua kết nối của TIẾN TRÌNH này kể từ lúc mở (PostgresDatabase.writes): tăng với mọi INSERT/UPDATE/DELETE. Chỉ đúng khi chạy MỘT
// tiến trình ứng dụng (như docker-compose.yml): ghi từ tiến trình khác không làm số này tăng, nên nhiều bản ứng dụng cùng một DB phải bỏ bộ nhớ đệm này.
const dataRevision = async () => store.db.writes;

export = { compute: new ComputeCache({ revision: dataRevision }), dataRevision };
```
- **Verbatim Code Snippet (`src/ops/compute-cache.ts:37-52`)**:
```typescript
  async get(key?, compute?) {
    const rev = await this.revision();
    const at = this.now();
    const hit = this.entries.get(key);
    const age = hit ? at - hit.at : -1; // đồng hồ lùi (age < 0) coi như hết hạn
    if (hit && hit.rev === rev && age >= 0 && age < this.ttlMs) {
      this.hits++;
      return hit.value;
    }
    this.misses++;
    const value = await compute();
    this.entries.delete(key); // đưa xuống cuối thứ tự chèn
    if ((await this.revision()) === rev) this.entries.set(key, { rev, at, value });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    return value;
  }
```
- **Technical Explanation**:
  The cache revision relies on `store.db.writes`, an in-memory integer incremented only when writes pass through the current Node.js process (`this.#writes++`).
  In any clustered, multi-process, or containerized deployment:
  - If Process 1 mutates timesheets, requests, or employee salaries, Process 2's `db.writes` counter remains unchanged.
  - Process 2 serves stale cached payroll calculations and approval tallies until `ttlMs` expires.
  - Furthermore, when the cache is cold, multiple concurrent HTTP requests for the same cache key will each trigger an independent, simultaneous execution of the heavy `compute()` function (cache stampede), consuming CPU and database bandwidth without single-flight coalescing.

---

### Finding 1.13: Duplicate Username Overwrites Existing Records in `createEmployee`
- **Target Files**:
  * `src/modules/employee-v2/employee-v2.controller.ts`, lines 38–49
  * `src/modules/employee-v2/employee-v2.service.ts`, lines 204–241
- **Verbatim Code Snippet (`src/modules/employee-v2/employee-v2.service.ts:204-241`)**:
```typescript
    await this.store.queryBuilder
      .insertInto('staff')
      .values(row)
      .onConflict((oc: any) =>
        oc.column('username').doUpdateSet({
          uuid: row.uuid,
          name: row.name,
          family_name: row.family_name,
...
```
- **Technical Explanation**:
  When `POST /api/v2/employees` is called, `EmployeeV2Controller.createEmployee` does not check if the username already exists. `save` issues an `INSERT ... ON CONFLICT (username) DO UPDATE SET uuid = row.uuid, ...`.
  If an administrator attempts to create a new employee with a username that is already taken:
  1. A new random `uuid` is generated.
  2. The existing employee record is silently overwritten with the new employee's name, password hash, and new UUID.
  3. Any existing references to the old employee's `uuid` in `system_requests`, `work_schedules`, or `timesheet_entries` trigger foreign key integrity violations (`23503`) or are permanently orphaned.

---

### Finding 1.14: Lost Updates in Slip Override Edits Despite Optimistic Check
- **Target File**: `src/platform/db.ts`, lines 1316–1333
- **Related File**: `src/data/payroll.repository.ts`, lines 230–245
- **Verbatim Code Snippet (`src/platform/db.ts:1316-1333`)**:
```typescript
  async setSlipOverride(u?, month?, values?, by?, reason?, opts: any = {}) {
    return await transaction(async () => {
      const current = await module.exports.getSlipOverride(u, month);
      if (opts.expectedRev !== undefined && opts.expectedRev !== current.rev)
        throw storeError('SLIP_STALE', 'Số sửa trên phiếu đã được người khác đổi, tải lại rồi làm lại', 409, {
          rev: current.rev
        });
      if (!Object.keys(values).length && current.rev === 0) return current; // chưa có gì để bỏ
      await slipOverridesRepo.upsert(
        u,
        month,
        JSON.stringify(values),
        by || null,
        now(),
        reason == null ? null : String(reason)
      );
      return await module.exports.getSlipOverride(u, month);
    });
  },
```
- **Verbatim Code Snippet (`src/data/payroll.repository.ts:230-244`)**:
```typescript
  async upsert(username: string, month: string, valuesJson: string, updatedBy: string | null, updatedAt: string, reason: string | null): Promise<void> {
    await this.qb
      .insertInto('slip_overrides')
      .values({ username, month, values_json: valuesJson, updated_by: updatedBy, updated_at: updatedAt, reason, rev: 1 })
      .onConflict(oc =>
        oc.columns(['username', 'month']).doUpdateSet(eb => ({
          values_json: eb.ref('excluded.values_json'),
          updated_by: eb.ref('excluded.updated_by'),
          updated_at: eb.ref('excluded.updated_at'),
          reason: eb.ref('excluded.reason'),
          rev: sql<number>`slip_overrides.rev + 1`
        }))
      )
      .execute();
  }
```
- **Technical Explanation**:
  `getSlipOverride` issues a plain `SELECT` without row-level locking (`FOR UPDATE`). When two administrators update an override concurrently with identical `expectedRev: 1`:
  1. Both transactions read `current.rev = 1`.
  2. Both pass the check `opts.expectedRev !== current.rev`.
  3. Both execute the `upsert`. In PostgreSQL, the `ON CONFLICT DO UPDATE` increments `rev: sql<number>'slip_overrides.rev + 1'`.
  4. The second transaction commits and overwrites the first transaction's modifications completely without throwing a 409 Conflict error.

---

## 2. Logic Chain

The findings demonstrate a structural pattern of concurrency vulnerabilities connecting the platform infrastructure up to the high-level business modules:

```
[Missing In-Transaction Assertion in AdvisoryLocks]
       │
       ├─► [pg_advisory_xact_lock called outside transaction releases immediately via pool.query]
       │
[Total Absence of Advisory Locks, Row Locks, and Transactions across V2 Aggregates]
       │
       ├─► Request V2: reviewRequest performs non-atomic multi-table writes
       │         └─► Double approval/rejection interleaving leaves schedules inverted (withLeave on rejected requests)
       │         └─► Multi-day leave schedule loop fails midway, leaving partial schedules and PENDING requests
       │         └─► Check-then-act overlap check allows duplicate overlapping leave requests
       │
       ├─► Attendance V2: recordPunch runs outside transactions
       │         └─► In-flight punch overwrites locked period timesheet (is_locked = false)
       │         └─► ensureDefaultSchedule races with overtime approval, wiping approved overtime back to PLANNED
       │
       ├─► Payroll V2: generatePeriodPayslips runs outside transactions
       │         └─► Inconsistent reads across employees + silent catch swallowing batch calculation failures
       │
       └─► Employee V2: createEmployee uses ON CONFLICT DO UPDATE on username
                 └─► Concurrent duplicate username overwrites existing employee and breaks UUID foreign keys
```

Parallel flaws exist in legacy workflows:
```
[Application-Space ID Generation in Audit Log]
       │
       └─► SELECT max(id) + 1 in memory -> Concurrent writes collide on PK 23505 -> Rolls back caller's business transaction

[Application-Space Run Number in Payroll Runs]
       │
       └─► SELECT max(run_no) + 1 in memory -> Concurrent period calculations crash with UNIQUE (month, run_no) 23505

[Synchronous Gzip Compression in Open Payroll Transaction]
       │
       └─► Blocks Node.js event loop while holding DB pool connection -> Connection pool starvation under load
```

---

## 3. Caveats

1. **Test Code Excluded**: Per strict integrity requirements, no test suites were executed or inspected. All failure modes and race interleavings are derived strictly from static code logic analysis of the production implementation files.
2. **PostgreSQL Version Assumptions**: The database is assumed to run PostgreSQL 16.x as configured in Docker and baseline migrations (`migrations/postgres/0001_baseline.sql`).
3. **No Code Written**: This is an analytical report; no source code or database schemas have been altered.

---

## 4. Conclusion

The Vladilena-Milize concurrency architecture contains systemic vulnerabilities:
1. **Advisory Lock Inefficacy**: `AdvisoryLocks` uses `pg_advisory_xact_lock` which has zero locking effect when called outside a `store.transaction()`, and the V2 modules do not use advisory locks at all.
2. **State Inversion & Orphaned Records**: Request approvals and cancellations are non-atomic and lack optimistic locking, enabling simultaneous conflicting approvals and orphaned schedule records.
3. **Period Integrity Breaches**: Attendance punch ingestion can silently overwrite `is_locked: false` on finalized timesheet records, and default schedule instantiation can overwrite approved overtime.
4. **Transient Failure Cascades**: Audit log ID generation in application memory turns concurrent business operations into primary key conflict rollbacks.
5. **Batch Inconsistency**: Payroll V2 batch calculation operates without transaction boundaries or error propagation, silently producing incomplete payroll runs.

---

## 5. Verification Method

To independently verify these findings on implementation code:

1. **Advisory Lock Auto-Commit Verification**:
   Inspect `src/data/locks.ts:13` and `src/data/postgres-database.ts:277-279`. Observe that `this.qb.execute()` resolves to `PoolDriver.query()`, which uses `this.pool.query(...)` when no transaction store is present, auto-committing the lock statement immediately.
2. **Request Review State Inversion**:
   Inspect `src/modules/request-v2/request-v2.service.ts:316-374`. Trace that `this.attendanceRepo.saveSchedule` executes before `this.repo.save(req)` without any enclosing `transaction()` call, proving schedule mutations persist even if the request is subsequently rejected or fails to save.
3. **Timesheet Lock Overwrite**:
   Inspect `src/data/attendance-v2.repository.ts:99-119`. Notice that `is_locked: eb.ref('excluded.is_locked')` in `onConflict.doUpdateSet` does not check `WHERE timesheet_entries.is_locked = false`.
4. **Audit Log Collision**:
   Inspect `src/platform/db.ts:454-458` and `src/data/audit-log.repository.ts:40-45`. Verify that `row.id` is derived from `last.id + 1` in JavaScript rather than a database sequence, and that the insert runs within the outer business transaction.
5. **Payroll Run Constraint Collision**:
   Inspect `src/data/payroll.repository.ts:61-68` and `migrations/postgres/0001_baseline.sql:110`. Observe that `run_no` is queried via `COALESCE(MAX(run_no), 0) + 1` without table/row locking, guaranteeing unique constraint violation `23505` on concurrent inserts.
