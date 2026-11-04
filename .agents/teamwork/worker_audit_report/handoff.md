# Handoff Report — Worker (Audit Report Author)

## 1. Observation

- **Deliverable Path**: `C:\Users\52.AI UD\Project\Vladilena-Milize\docs\audits\AUDIT-2026-11-CONCURRENCY-TECHDEBT.md`
- **Deliverable Size**: 1,348 lines, 84,515 bytes.
- **Git Status**:
  Command: `git status --porcelain`
  Output:
  ```text
  ?? .agents/teamwork/
  ?? docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md
  ?? docs/superpowers/plans/2026-11-04-pure-v2-modular-backend.md
  ?? docs/superpowers/specs/2026-11-04-pure-v2-modular-backend-design.md
  ```
  Verified: Zero modifications made to `src/`, `web/`, `migrations/`, or `test/`. Strict read-only audit constraint respected 100%.

- **Synthesized Findings**:
  1. **Dual-Schema Schism & Zeroed Official Payroll Runs**:
     - `src/data/legacy-schema.ts:1–33`: `LegacySchema` adds 12 dropped tables (`attendance_days`, `attendance_sessions`, `punches`, `timesheets`, `sheet_approvals`, `punch_requests`, `corrections`, `explanations`, `leave_ledger`, `advance_requests`, `advance_approval_months`, `advance_approval_entries`) as `any`.
     - `migrations/postgres/0001_baseline.sql:1–330`: 12 tables do not exist in PostgreSQL.
     - `src/platform/db.ts:1271–1291` (`getSheet` catches error and returns `{ days: {} }`) & `src/platform/attendance-sessions.ts:44–53` (catches error and returns `[]`).
     - `src/domain/period/periods.ts:349–368` (`calculate` calls `service.loadInputs` -> `store.getSheet()` -> gets empty days -> writes official payslips to `payroll_runs` and `payslips` with 0 worked days and 0 hours).
     - `src/data/advance-approvals.repository.ts:58–65`, `src/data/attendance.repository.ts:127–139`, `src/data/catalog.repository.ts:69–80`: unhandled write calls crash with PostgreSQL error 500 (`relation ... does not exist`).
  2. **Payroll V2 Isolation & Critical Bugs**:
     - `src/modules/payroll-v2/payroll-v2.controller.ts:25–32` & `src/domain/payroll-v2/payroll-v2-service.ts:7–24`: Pure in-memory calculation, 0 database writes. Web frontend has 0 calls to `/api/v2/*`.
     - `src/platform/authz.ts:310–330, 364–366` & `src/http/api-gate.ts:54–58`: `routeKey` lacks `v2/payroll`, `ROUTE_CAPS` has no policy for `/v2/payroll`, resulting in 100% 403 `NO_ROUTE_POLICY` rejection on `PayrollV2Controller`.
     - `src/data/payroll-v2.repository.ts:95–104`: Date string `${month}-31` on PostgreSQL `DATE` column (`timesheet_entries.work_date`) causes `date/time field value out of range` on all 5 months with < 31 days (Feb, Apr, Jun, Sep, Nov), silently swallowed by empty `catch {}` in `PayrollV2Service.generatePeriodPayslips:19`, returning 0 payslips for the entire company.
     - `src/data/payroll-v2.repository.ts:107–113` & `src/domain/payroll-v2/payroll-v2-service.ts:107–121`: Query on `system_requests` lacks month/date filter, cumulatively summing all historical lifetime OT and advances onto every single monthly payslip.
     - Domain calculation flaws: 100% OT forced into 200% (`x20`) (`payroll-v2-service.ts:146–150`), Flex shift allowance mismatch 20% vs 10% (`shift.ts:41–52`), magic late deduction `-16827` and tax exemption `+34615` (`employee-payslip.ts:326–331, 345`), mandatory 10.5% insurance deduction without status checking (`employee-payslip.ts:348–350`), KPI normalization boundary bug at score = 1 (`payroll-v2-service.ts:126–132`).
  3. **Attendance V2 & Employee V2 Defects**:
     - `src/domain/attendance-v2/daily-timesheet.ts:103–122`: Timezone proximity heuristic guessing UTC vs local time; lines 431–439: lunch break not deducted in work duration.
     - `src/modules/employee-v2/employee-v2.controller.ts:253–262`: `DELETE /api/v2/employees/:username` calls `this.service.delete()`, which does not exist in `EmployeeV2Service` (runtime crash 500). `EmployeeV2Repository` is completely orphaned.
     - Direct deletion violates foreign key constraints (`employee-v2.repository.ts:398–404`). Annual leave model impedance mismatch (`db.ts:236` `leaveAdjust = leave_total_days`).
  4. **UI-Bridge Stubs & Mock Data**:
     - `src/modules/ui-bridge/ui-bridge.controller.ts:123–137`: Fake stubs `PUT /sheet/bulk` and `PUT /staff/shift-bulk` return `{ ok: true }` without writing to DB.
     - `ui-bridge.controller.ts:191–206`: `GET /today` returns hardcoded dummy status (`checked-out`, `in: null`, `out: null`).
     - Missing routes `PUT /api/ot` and `POST /api/explanations/:id/decide` return 404.
  5. **Concurrency, Race Conditions & Background Execution**:
     - `src/data/locks.ts:9–15` & `src/data/postgres-database.ts:277–279`: `pg_advisory_xact_lock` auto-commits and immediately releases when called outside `store.transaction()`. Complete omission of locks across all V2 aggregates.
     - `src/modules/request-v2/request-v2.service.ts:305–376`: Request review interleaving, state inversion, orphaned schedule leaves pointing to rejected requests, non-atomic multi-day leave loop.
     - `request-v2.service.ts:136–154`: Check-then-act leave TOCTOU allows overlapping leaves (no exclusion constraint). Lines 223–243: 40-hour monthly OT cap race condition.
     - `src/data/attendance-v2.repository.ts:99–119`: In-flight punch calculation writes `is_locked: excluded.is_locked`, silently unlocking locked payroll periods. Lines 392–418: `ensureDefaultSchedule` check-then-act races with overtime approval, overwriting approved overtime back to planned schedules.
     - `src/platform/db.ts:453–460` & `src/data/audit-log.repository.ts:40–42`: Audit log PK in-memory calculation (`last.id + 1`) causes unique constraint violations `23505` on concurrent writes, rolling back caller business transactions.
     - `src/data/payroll.repository.ts:61–73`: `MAX(run_no) + 1` crashes concurrent period calculations on `UNIQUE (month, run_no)`.
     - `src/domain/period/periods.ts:352–368` & `src/platform/db.ts:933`: Synchronous `zlib.gzipSync` inside open DB transactions blocks event loop and starves connection pool.
     - `src/ops/compute-cache.ts:37–52` & `src/ops/shared-cache.ts:6–10`: Process-local `writes` counter fails in clustered multi-replica deployments.
     - `src/modules/employee-v2/employee-v2.service.ts:204–241`: Blind overwrite on duplicate username replaces UUID and breaks FKs.
     - `src/platform/db.ts:1316–1333`: Lost updates in slip override edits due to lack of `FOR UPDATE`.
     - Background execution: `LeaveAccountService.start()` floating promise and overlapping intervals (`src/domain/leave/leave-account-service.ts:83–92`); dead `punch_requests` periodic purge (`src/main.ts:41–52`); connection pool capped at 10 with no timeouts (`src/data/postgres-database.ts:110–130`); SSE heartbeat query storm (`src/platform/events.ts:161–175, 356–362`).
  6. **Pure Logic Verification & Dead Code**:
     - `src/modules/request-v2/request-v2.controller.ts:16–20, 134–135`: Spoofing of `employeeId` and `reviewerId`.
     - `src/params/attributes.ts` (295 lines): Dead dynamic attributes system rejected by `pay-tail-calc.ts:46, 52–57`.
     - Orphaned files: `src/domain/position/seed-data.ts` (38 lines) and `src/engine/attendance-status.ts` (62 lines). Passthrough wrapper: `src/domain/payroll/payroll-service.ts` (3 lines).

---

## 2. Logic Chain

1. **Step 1 (Schema & Data Flow)**:
   The database migration `0001_baseline.sql` created 20 tables and intentionally omitted 12 legacy tables. To keep legacy code compilable, `LegacySchema` was introduced. Legacy repositories caught table-missing errors and returned empty data. When `periods.calculate` runs, it calls `loadInputs`, which calls these legacy stores. Because empty data is returned, `calculate` writes zeroed payslips into `payroll_runs` and `payslips`.
2. **Step 2 (V2 Isolation & Controller Lockout)**:
   V2 modules write to new tables, but `PayrollV2Service` does not persist payslips to DB. In addition, `authz.ts:routeKey` lacks `v2/payroll`, so `ApiGate` unconditionally blocks all requests to `PayrollV2Controller` with 403 `NO_ROUTE_POLICY`. Web clients only call `/api/periods/*`, running V1.
3. **Step 3 (Date & Calculation Defects)**:
   In `PayrollV2Repository.getMonthlyData`, `endDate = '${month}-31'` causes PostgreSQL to throw `date/time field value out of range` on all 5 months with < 31 days. In `PayrollV2Service.generatePeriodPayslips`, the `catch {}` block silently swallows this error, resulting in 0 payslips for the entire company for Feb, Apr, Jun, Sep, Nov. Furthermore, `system_requests` is queried without month filtering, cumulatively summing all historical OT and advances onto every single monthly payslip.
4. **Step 4 (Concurrency & Locking Failures)**:
   `AdvisoryLocks` uses `pg_advisory_xact_lock` which autocommits immediately when called outside `store.transaction()`. V2 aggregates execute outside transactions without advisory or row locks. This permits approval race conditions, TOCTOU leave collisions, monthly OT cap breaches, timesheet lock overwrites, audit log PK collisions, and period calculation constraint collisions.
5. **Step 5 (Resource Starvation)**:
   The connection pool is capped at 10 with no timeouts. Synchronous `zlib.gzipSync` executes inside employee loops while holding DB transaction connections. SSE heartbeat queries `staff` for every client every 25s. These combine to starve the pool and hang the server under load.
6. **Step 6 (Synthesis & Roadmap)**:
   Synthesizing all observations into `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md` yields a unified architectural assessment and a prioritized 4-phase remediation roadmap (Schema Unification, Concurrency & Locking Framework, Persistence & API Reconciliation, Operational Hardening).

---

## 3. Caveats

- **No Caveats**: All findings were verified directly against actual implementation source files with exact file paths and line number ranges. No comments or test suites were relied upon.
- **Read-Only Scope**: The audit remained strictly read-only. No application code, test code, or database schemas were modified.

---

## 4. Conclusion

The audit deliverable `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md` has been successfully created. It is 1,348 lines long, comprehensive, fully cited with verbatim source code, and directly covers all requirements from the orchestrator and original request:
1. Executive Summary & Architecture Verdict
2. Backend V2 Aggregates & Legacy V1 Reuse / Transition Debt
3. Concurrency, Race Conditions & Background Execution Analysis
4. Pure Logic Verification & Redundancy Detection
5. Architectural Remediation Roadmap & Prioritized Recommendations

---

## 5. Verification Method

1. **Inspect Deliverable**:
   View `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md` to verify all 5 major sections, code snippets, and line number ranges.
2. **Verify Repository Cleanliness**:
   Run `git status --porcelain` to verify that no source code or test files in `src/`, `web/`, `migrations/`, or `test/` were touched.
3. **Check Code Inspection Checkpoints**:
   - `src/data/locks.ts:9-15` (Advisory locks outside transaction autocommit)
   - `src/data/payroll-v2.repository.ts:95-104` (`${month}-31` on DATE column)
   - `src/data/payroll-v2.repository.ts:107-113` (Unbounded lifetime requests query)
   - `src/platform/authz.ts:310-330` (Missing `v2/payroll` routing policy)
   - `src/modules/employee-v2/employee-v2.controller.ts:260` (Non-existent `this.service.delete()`)
   - `src/platform/db.ts:453-460` (Audit log PK collision `last.id + 1`)
   - `src/data/attendance-v2.repository.ts:113` (Timesheet lock overwrite `is_locked: eb.ref('excluded.is_locked')`)
