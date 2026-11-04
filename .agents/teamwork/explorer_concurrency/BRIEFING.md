# BRIEFING — 2026-11-04T06:50:00Z

## Mission
Conduct an in-depth, code-level concurrency, race conditions, advisory locks, and transaction boundaries audit across Vladilena-Milize.

## 🔒 My Identity
- Archetype: explorer
- Roles: Concurrency, Race Conditions & Advisory Locks Explorer
- Working directory: C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\
- Original parent: a043682d-be92-4dd4-baf0-f70c98cfedab
- Milestone: Concurrency & Advisory Locks Audit

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strictly READ-ONLY: DO NOT modify any application source code or test files.
- DO NOT read or rely on code comments instead of analyzing actual implementation logic.
- DO NOT read test code or run test suites to infer system behavior (verify logic directly from implementation source code).
- For EVERY finding: exact file path, line numbers, verbatim snippet, technical interleaving explanation.
- Write files only in own working directory (.agents/teamwork/explorer_concurrency/).

## Current Parent
- Conversation ID: a043682d-be92-4dd4-baf0-f70c98cfedab
- Updated: not yet

## Investigation State
- **Explored paths**:
  * Advisory locking infrastructure: `src/data/locks.ts`, `src/platform/db.ts`, `src/data/postgres-database.ts`, `src/data/db-dialect.ts`.
  * Payroll V2 & Legacy: `src/domain/payroll-v2/payroll-v2-service.ts`, `src/data/payroll-v2.repository.ts`, `src/domain/period/periods.ts`, `src/data/payroll.repository.ts`.
  * Attendance V2 & Punches: `src/modules/attendance-v2/attendance-v2.service.ts`, `src/data/attendance-v2.repository.ts`, `src/domain/attendance-v2/`.
  * Request V2 & Approvals: `src/modules/request-v2/request-v2.service.ts`, `src/domain/request-v2/system-request.ts`, `src/data/request-v2.repository.ts`, `src/modules/approvals/approvals.controller.ts`, `src/domain/approvals/approvals.ts`, `src/data/attendance.repository.ts`.
  * Employee V2: `src/modules/employee-v2/employee-v2.service.ts`, `src/modules/employee-v2/employee-v2.controller.ts`, `src/data/employee-v2.repository.ts`.
  * Advance Approvals: `src/domain/advance/advance-approvals.ts`, `src/data/advance-approvals.repository.ts`.
  * Audit logging: `src/platform/db.ts`, `src/data/audit-log.repository.ts`.
  * Background execution & Caches: `src/main.ts`, `src/domain/leave/leave-account-service.ts`, `src/ops/compute-cache.ts`, `src/ops/shared-cache.ts`.
- **Key findings**:
  1. Complete absence of advisory locks, row-level locks, and transactions in entire V2 aggregate suite (`RequestV2Service`, `AttendanceV2Service`, `PayrollV2Service`, `EmployeeV2Service`).
  2. Double Approval / Approver conflict race condition in `RequestV2Service.reviewRequest` causing orphaned attendance schedule mutations when a request is concurrently rejected.
  3. TOCTOU race condition in `RequestV2Service.createLeaveRequest` leading to duplicate overlapping leaves.
  4. Non-atomic schedule injection in `RequestV2Service.reviewRequest` leaving partial multi-day schedules on failure.
  5. In-flight punch overwriting locked payroll timesheet (`is_locked: false`) in `AttendanceV2Repository.saveTimesheet`.
  6. Race condition between `AttendanceV2Service.ensureDefaultSchedule` and request approval overwriting approved overtime schedules with default regular schedules.
  7. Audit log primary key collision in `src/platform/db.ts:454` (`last.id + 1`) aborting concurrent business transactions.
  8. `payroll_runs` next run number race condition in `PayrollRunsRepository.nextRunNo` causing 23505 unique constraint violation on concurrent calculations.
  9. Connection pool starvation and event loop blockage from synchronous `zlib.gzipSync` execution inside open database transactions during payroll calculation.
  10. Process-local `writes` counter in `ComputeCache` causing cross-replica cache desynchronization and cache stampedes.
  11. Split-brain advance requests between V1 (`advance_approval_entries` + advisory lock) and V2 (`system_requests` without locks).
- **Unexplored areas**: None remaining within scope.

## Key Decisions Made
- Formulate findings into a rigorous 5-component report (`handoff.md`) with exact file paths, line ranges, verbatim source snippets, and step-by-step interleaving sequences.

## Artifact Index
- `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\handoff.md` — Final audit report
- `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\progress.md` — Liveness heartbeat and progress tracker
- `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\DISPATCH.md` — Dispatch log
- `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\BRIEFING.md` — Situational awareness
