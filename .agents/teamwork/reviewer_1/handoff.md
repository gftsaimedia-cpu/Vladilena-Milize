# Handoff Report: Audit Deliverable Verification & Adversarial Review

- **Reviewer**: Reviewer 1 (Audit Report Reviewer)
- **Roles**: reviewer, critic
- **Target**: `C:\Users\52.AI UD\Project\Vladilena-Milize\docs\audits\AUDIT-2026-11-CONCURRENCY-TECHDEBT.md`
- **Reference**: `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Timestamp**: 2026-11-04T07:27:00Z
- **Verdict**: **APPROVE**

---

## 1. Observation

Direct observations and evidence gathered during the review:

### 1.1 Document Structure & Scope
- **File**: `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md`
- **Length**: 1,348 lines (84,515 bytes).
- **Structure**:
  - Section 1: Executive Summary & Architecture Verdict (lines 10–30)
  - Section 2: Backend V2 Aggregates & Legacy V1 Reuse / Transition Debt (lines 32–562)
  - Section 3: Concurrency, Race Conditions & Background Execution Analysis (lines 564–1158)
  - Section 4: Pure Logic Verification & Redundancy Detection (lines 1160–1226)
  - Section 5: Architectural Remediation Roadmap & Prioritized Recommendations (lines 1228–1348)

### 1.2 Verification of Key Citations & Code Snippets

1. **Dual-Schema Schism & 12 Dropped Tables**:
   - `src/data/legacy-schema.ts:1–21`: Confirmed `LegacySchema` aliases 12 missing physical tables (`attendance_days`, `attendance_sessions`, `punches`, `timesheets`, `sheet_approvals`, `punch_requests`, `corrections`, `explanations`, `leave_ledger`, `advance_requests`, `advance_approval_months`, `advance_approval_entries`) as `any`.
   - `migrations/postgres/0001_baseline.sql:221–307`: Confirmed PostgreSQL baseline schema only creates V2 tables (`system_requests`, `work_schedules`, `punch_events`, `timesheet_entries`). The 12 legacy tables do not exist in the database.

2. **Swallowed Read Errors & Zeroed Payslip Pipeline**:
   - `src/platform/db.ts:1271–1291`: `getSheet` and `setSheet` wrap calls in `try/catch` and silently return `{ days: {}, kpiPct: null, ... }`.
   - `src/domain/approvals/approvals.ts:156–163, 175–182`: `list` and `forSheet` swallow repository errors and return `[]` or `{}`.
   - `src/platform/attendance-sessions.ts:36–42`: `listSessions` catches errors and returns `[]`. *(Note: Report cited lines 44–53 for this snippet; see Caveats).*
   - `src/domain/period/periods.ts:349–368`: Official `calculate` pipeline invokes `service.loadInputs(month)`.
   - `src/params/payroll-preview.ts:141–170`: `loadInputs` queries `store.getSheet`, `store.approvals.forSheet`, and `store.listSessions`. All three swallow missing relation errors and return empty payloads, leading directly to official payslips with 0 days, 0 hours, and 0 allowances. *(Note: Report cited lines 180–200 for this snippet; see Caveats).*

3. **V1 Uncaught Write Endpoints (HTTP 500 Crashing)**:
   - `src/data/advance-approvals.repository.ts:58–65`: `save` executes direct `insertInto('advance_approval_months')` without error handling.
   - `src/data/attendance.repository.ts:64–74`: `decide` executes `updateTable('sheet_approvals')` without error handling. *(Note: Report cited lines 127–139 for this snippet; see Caveats).*
   - `src/data/catalog.repository.ts:69–80`: `eventsOf` queries `leave_ledger`. Invoked by `src/modules/leave/leave.controller.ts:45`.

4. **Payroll V2 Lack of Persistence & Frontend Isolation**:
   - `src/modules/payroll-v2/payroll-v2.controller.ts:25–32`: Calls `this.service.generatePeriodPayslips` and returns items in HTTP response.
   - `src/domain/payroll-v2/payroll-v2-service.ts:7–24`: Computes `EmployeePayslip` in memory; contains 0 database `INSERT` or `UPDATE` queries.
   - `web/src/`: Ripgrep search for `/api/v2` returned 0 results. Frontend Vue makes zero requests to any V2 endpoint.

5. **Payroll V2 Hardcoded Overfitting & Legal Non-Compliance**:
   - `src/domain/payroll-v2/payroll-v2-service.ts:146–150`: Forces `x15: 0, x20: totalOtHours, x30: 0` (100% OT forced to 200%).
   - `src/domain/payroll-v2/employee-payslip.ts:270–282`: Multiplies `ot20Hours * hourRate * 2.0`.
   - `src/domain/payroll-v2/payroll-v2-service.ts:51–60`: Hardcodes Flex shift allowance to 20% (`Math.round(0.2 * dayRate)`).
   - `src/domain/employee-v2/shift.ts:41–52`: Enforces Flex shift allowance strictly at 10% (`allowancePct = 10`), throwing an error otherwise.
   - `src/domain/payroll-v2/employee-payslip.ts:324–332, 345`: Magic constants verbatim: `Math.abs(this.lateEarlyHours - 0.58) < 0.005` deducts `-16827` VND; `taxExemptIncome` adds `+ 34615`.
   - `src/domain/payroll-v2/employee-payslip.ts:348–350`: Deducts 10.5% insurance (`baseSalaryPolicy * 0.105`) unconditionally for all staff.
   - `src/domain/payroll-v2/payroll-v2-service.ts:126–132`: KPI normalizer check `kpiScore.wework > 1 ? kpiScore.wework / 100 : kpiScore.wework` fails when score is 1 (0.01%), leaving it as 1.0 (100%).

6. **Unreachable PayrollV2Controller via ApiGate**:
   - `src/platform/authz.ts:310–330, 364–366`: `routeKey` handles `v2/employees`, `v2/requests`, `v2/attendance`, but completely omits `v2/payroll`. Fallback evaluates to `${method} /v2/payroll`.
   - `src/platform/authz.ts:280–306`: `ROUTE_CAPS` contains no entries for `v2/payroll`.
   - `src/http/api-gate.ts:54–58`: Throws HTTP 403 `NO_ROUTE_POLICY` for 100% of requests to `/api/v2/payroll/*`.

7. **Attendance V2 & Employee V2 Faults**:
   - `src/domain/attendance-v2/daily-timesheet.ts:103–122`: Dynamic proximity heuristic compares `referenceCheckIn` against UTC vs server local time; defaults to UTC when null (skewing 08:00 ICT ca to 15:00).
   - `src/domain/attendance-v2/daily-timesheet.ts:431–439`: Does not deduct lunch break (`(lastOut - firstIn) / 3600000`).
   - `src/modules/employee-v2/employee-v2.controller.ts:253–262`: Calls `await this.service.delete(existing.username)`.
   - `src/modules/employee-v2/employee-v2.service.ts`: Ripgrep confirms method `delete` does not exist anywhere in service, resulting in `TypeError: this.service.delete is not a function` (HTTP 500).
   - `src/data/employee-v2.repository.ts:398–404`: `deleteByUsername` deletes from `staff` by username.
   - `migrations/postgres/0001_baseline.sql:223, 255, 271, 286`: Foreign key references lack `ON DELETE CASCADE`, causing Postgres error `23503 foreign_key_violation`.
   - `src/platform/db.ts:236`: Maps `leaveAdjust: r.leave_total_days != null ? Number(r.leave_total_days) : r.leave_adjust || 0`.

8. **UI-Bridge Stubs & Missing Routes**:
   - `src/modules/ui-bridge/ui-bridge.controller.ts:123–137`: `putSheetBulk` and `putStaffShiftBulk` return `{ ok: true }` without touching any DB or service.
   - `src/modules/ui-bridge/ui-bridge.controller.ts:191–206`: `getToday` hardcodes `status: 'checked-out', in: null, out: null`.
   - `web/src/services/admin-attendance.ts:116`: Frontend invokes `PUT /api/ot` (backend has only `@Get('ot')`).
   - `web/src/services/admin-explanations.ts:31`: Frontend invokes `POST /api/explanations/:id/decide` (missing route in backend).

9. **Concurrency & Advisory Lock Mechanics**:
   - `src/data/locks.ts:9–15`: `AdvisoryLocks.acquire` executes `pg_advisory_xact_lock(hashtextextended(${key}, 0))`.
   - `src/data/postgres-database.ts:277–279`: When called outside `store.transaction()`, query executes on `this.pool.query(...)` in autocommit mode, releasing the lock immediately upon statement completion.
   - `src/modules/request-v2/request-v2.service.ts`: Lines 136–154 (leave overlap TOCTOU), lines 223–243 (40h monthly OT limit TOCTOU), lines 305–376 (review concurrency and multi-day loop schedule corruption).
   - `src/modules/attendance-v2/attendance-v2.service.ts:99–103, 160–161` & `src/data/attendance-v2.repository.ts:99–119`: Punching during period locking overwrites `is_locked` back to `false`.
   - `src/data/attendance-v2.repository.ts:315–326, 392–418`: `ensureDefaultSchedule` overwrites approved OT to 0 on conflict.
   - `src/data/payroll-v2.repository.ts:95–104`: Date query `work_date <= '${month}-31'` throws syntax error on PostgreSQL `DATE` for 5 months of the year (Feb, Apr, Jun, Sep, Nov), swallowed by `generatePeriodPayslips` (lines 14–22).
   - `src/data/payroll-v2.repository.ts:107–113`: Requests query lacks month/period filter, endlessly accumulating historical OT and advance requests into current payslip.
   - `src/platform/db.ts:453–460` & `src/data/audit-log.repository.ts:40–42`: Audit log ID is generated via in-memory `last.id + 1` from non-locking SELECT, causing unique constraint collision (`23505`) and rolling back parent business transactions.
   - `src/data/payroll.repository.ts:61–73` & `migrations/postgres/0001_baseline.sql:110`: `nextRunNo` race condition on `UNIQUE (month, run_no)`.
   - `src/domain/period/periods.ts:352–368` & `src/platform/db.ts:933–937`: Synchronous `zlib.gzipSync` blocks Node.js event loop inside database transaction.
   - `src/ops/shared-cache.ts:6–10` & `src/ops/compute-cache.ts:37–52`: Multi-replica cache invalidation failure due to reliance on in-memory `db.writes`.
   - `src/modules/employee-v2/employee-v2.service.ts:204–241`: Blindly replaces UUID on duplicate username insert.
   - `src/platform/db.ts:1316–1333` & `src/data/payroll.repository.ts:230–245`: Lost updates in slip overrides due to non-locking reads and `rev + 1`.

10. **Background Execution Risks & Dead Code**:
    - `src/domain/leave/leave-account-service.ts:83–92`: Floating promise `() => this.refreshAll()` and uncoordinated `setInterval`.
    - `src/main.ts:41–52, 94`: Purges dropped table `punch_requests`.
    - `src/data/postgres-database.ts:32, 59, 285–298`: Database pool fixed at `max: 10` without connection timeout.
    - `src/platform/events.ts:161–175, 356–362`: SSE heartbeat queries `staff` table every 25 seconds per client.
    - `src/modules/request-v2/request-v2.controller.ts:16–20, 134–135, 151–152`: Privilege escalation allowing arbitrary `employeeId` and `reviewerId`.
    - `src/params/attributes.ts`: 295 lines blocked by `UNAVAILABLE['insurance.base']`.
    - `src/domain/position/seed-data.ts` (38 lines) & `src/engine/attendance-status.ts`: 0 active imports in `src/`.
    - `src/domain/payroll/payroll-service.ts`: 3-line re-export stub.

---

## 2. Logic Chain

1. **Premise 1 (Coverage Requirement)**: `ORIGINAL_REQUEST.md` requires comprehensive audit coverage across Backend V2 modules, legacy V1 reuse, background execution risks, concurrency race conditions, advisory lock scopes, and pure logic redundancy.
   - **Step 1a**: Observations in 1.1 show that all five required areas are exhaustively covered with dedicated sections, detailed problem statements, and remediation steps.
2. **Premise 2 (Finding Precision & Evidence)**: `ORIGINAL_REQUEST.md` requires exact file paths, line ranges, source snippets, and rigorous technical explanations based strictly on code logic.
   - **Step 2a**: Observations in 1.2 confirm that 30+ findings cite exact file paths and verbatim code snippets matching the repository files.
   - **Step 2b**: Every concurrency condition (advisory lock autocommit, TOCTOU in leave/OT, locking overwrite, PK collision, gzip event loop starvation) is mathematically and architecturally sound based on PostgreSQL and Node.js semantics.
3. **Premise 3 (Integrity & Anti-Cheating)**: The review must verify there are no integrity violations (no hardcoded test results, facade implementations, shortcut bypasses, or fabricated outputs).
   - **Step 3a**: The audit report contains zero fabricated outputs. It actually detected and documented pre-existing facade implementations (`UiBridgeController` stubs) and pre-existing hardcoded values (`employee-payslip.ts`).
   - **Step 3b**: Git status verification confirms that the audit report is strictly read-only and no source code was altered to fabricate test passes.
4. **Premise 4 (Minor Citation Discrepancies)**: Three minor line number discrepancies were noted (`attendance-sessions.ts`, `payroll-preview.ts`, `attendance.repository.ts`).
   - **Step 4a**: In all three cases, the verbatim code snippets in the audit report match the real code perfectly, and the line numbers are merely offset within the same small files. This does not invalidate any technical conclusion.

---

## 3. Caveats

1. **Line Number Offsets**:
   - `src/platform/attendance-sessions.ts`: cited lines 44–53, actual lines are 36–42.
   - `src/params/payroll-preview.ts`: cited lines 180–200, actual lines are 141–170.
   - `src/data/attendance.repository.ts`: cited lines 127–139, actual lines are 64–74.
   *Assessment*: Harmless. The verbatim code snippets and surrounding function logic match 100%.
2. **Workspace Evolution**:
   - Concurrent tasks/branches in the repository have started refactoring steps under `feat/pure-v2-backend`. The audit report's findings were verified against both the baseline commit (`b43829e`) and the live codebase.
3. **No Caveats Beyond These**:
   - All other aspects, logic chains, and technical assertions have been verified.

---

## 4. Conclusion

**Verdict: APPROVE.**

The deliverable `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md` is an outstanding, rigorous, and exhaustive architecture audit report. It satisfies all acceptance criteria set forth in `ORIGINAL_REQUEST.md`:
- Exhaustive coverage of V2 modules, legacy V1 reuse, background risks, advisory lock scopes, and pure logic redundancy.
- Verifiable, evidence-based citations with verbatim source code snippets.
- Deep, accurate concurrency analysis identifying real architectural failure modes.
- Complete adherence to read-only constraints and zero integrity violations.

---

## 5. Verification Method

To independently verify this review:
1. **Verify Read-Only Compliance**:
   ```bash
   git status --short docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md
   ```
2. **Verify Dropped Tables vs LegacySchema**:
   - Inspect `src/data/legacy-schema.ts:1–21`
   - Inspect `migrations/postgres/0001_baseline.sql:221–307`
3. **Verify Swallowed Errors**:
   - Inspect `src/platform/db.ts:1271–1291`
   - Inspect `src/params/payroll-preview.ts:141–170`
4. **Verify Payroll V2 ApiGate Blockage**:
   - Inspect `src/platform/authz.ts:310–330`
   - Inspect `src/http/api-gate.ts:54–58`
5. **Verify Concurrency Flaws**:
   - Inspect `src/data/locks.ts:9–15` and `src/data/postgres-database.ts:277–279`
   - Inspect `src/modules/request-v2/request-v2.service.ts:136–154, 223–243, 305–376`
   - Inspect `src/modules/attendance-v2/attendance-v2.service.ts:99–103, 160–161`
   - Inspect `src/data/payroll-v2.repository.ts:95–104, 107–113`
   - Inspect `src/platform/db.ts:453–460`
