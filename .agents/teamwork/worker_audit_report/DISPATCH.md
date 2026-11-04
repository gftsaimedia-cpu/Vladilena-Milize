# Dispatch for Worker: Audit Deliverable Document Authoring

Authoritative request file: C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\ORIGINAL_REQUEST.md
Working directory: C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\worker_audit_report\
Target deliverable: C:\Users\52.AI UD\Project\Vladilena-Milize\docs\audits\AUDIT-2026-11-CONCURRENCY-TECHDEBT.md

## Input Reports to Synthesize
1. `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_v2_legacy\handoff.md` (Backend V2 Architecture & Legacy Reuse)
2. `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\handoff.md` (Concurrency, Race Conditions & Advisory Locks)
3. `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_background_logic\handoff.md` (Background Jobs, Async Execution & Dead Logic)

## Mandatory Requirements
- Write the comprehensive audit document to `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md`.
- STRICTLY READ-ONLY regarding application source code: DO NOT modify any code in `src/`, `web/`, `migrations/`, or test files. Only create `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md`.
- DO NOT rely on comments or test code. Include verbatim code snippets, exact file paths, line number ranges, and rigorous technical failure analysis for EVERY finding.
- Detail all Backend V2 endpoints/aggregates and explicitly enumerate every reused legacy V1 component, helper, query, or table.
- Detail concurrent execution paths, background job collision risks, advisory lock scope mismatches, and race conditions.
- Detail redundant, dead, or nonsensical code constructs.
- Provide a clear, prioritized remediation roadmap.


## 2026-11-04T07:04:57Z
You are Worker (Audit Report Author).
Your working directory: C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\worker_audit_report\

MANDATORY FIRST STEP:
Read C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\ORIGINAL_REQUEST.md and C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\worker_audit_report\DISPATCH.md before doing anything else.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Exclusively Owned File
You exclusively own and will author:
`C:\Users\52.AI UD\Project\Vladilena-Milize\docs\audits\AUDIT-2026-11-CONCURRENCY-TECHDEBT.md`

All other repository source files (`src/`, `web/`, `migrations/`, test files) are strictly READ-ONLY. DO NOT modify any application code or test code.

## Primary Sources of Truth to Synthesize
Read and synthesize findings from the 3 completed explorer handoff reports:
1. `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_v2_legacy\handoff.md`
2. `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\handoff.md`
3. `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_background_logic\handoff.md`

Also reference:
- `docs/audits/` (database audit inventory)
- `docs/superpowers/AUDIT-2026-11-02.md`
- `docs/superpowers/PROGRAM.md`

## Required Report Structure for `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md`
1. **Executive Summary & Architecture Verdict**:
   - High-level systemic state of Vladilena-Milize backend.
   - Core failure modes: dual-schema schism, zeroed payroll runs, concurrency race conditions, unreachability of V2 controllers, and connection starvation risks.
2. **Backend V2 Aggregates & Legacy V1 Reuse / Transition Debt**:
   - Comprehensive inventory of all V2 endpoints / aggregates (Payroll V2, Attendance V2, Employee V2, Request V2, and UI-Bridge).
   - Explicit enumeration of EVERY reused legacy V1 component, helper, query, and table.
   - Dual-Schema Schism: 12 dropped legacy tables in `LegacySchema` vs PostgreSQL `0001_baseline.sql`. Swallowed read errors causing zeroed official payroll data (`periods.calculate` -> `loadInputs()`). Unhandled 500 crashes on legacy write endpoints (`advance-approvals`, `approvals/decide`, `leave/ledger`).
   - Payroll V2 zero-persistence & frontend client disconnection (0 calls from frontend to `/api/v2/*`).
   - Payroll V2 calculation flaws (26 standard days, 100% OT forced into 200%, Flex shift allowance mismatch 20% vs 10%, magic late deduction `-16827` and tax exemption `+34615`, blind 10.5% insurance deduction, KPI normalization boundary bug at score = 1).
   - Unreachability of `PayrollV2Controller` (`authz.ts:310-365` missing route policy, `ApiGate` rejecting with 403 `NO_ROUTE_POLICY`).
   - Attendance V2 timezone heuristics guessing (UTC vs local time distance), lunch break not deducted in work duration.
   - Employee V2 runtime crash (`DELETE /api/v2/employees/:username` calling non-existent `this.service.delete()`), orphaned `EmployeeV2Repository`, FK violations on direct delete, annual leave model impedance mismatch (`leaveAdjust = leave_total_days`).
   - UI-Bridge fake stubs (`PUT /sheet/bulk`, `PUT /staff/shift-bulk` returning `{ ok: true }` without writing to DB), hardcoded mock status in `GET /today`, missing routes `PUT /api/ot` and `POST /api/explanations/:id/decide` returning 404.
3. **Concurrency, Race Conditions & Background Execution Analysis**:
   - Advisory Lock Scope Mismatch (`src/data/locks.ts:9-15` `pg_advisory_xact_lock` auto-commits and immediately releases when called outside `store.transaction()`).
   - Complete omission of advisory and row-level locks across all V2 aggregates.
   - Request V2 approval interleaving, state inversion, orphaned schedule leaves pointing to rejected requests, non-atomic multi-day leave loop (`src/modules/request-v2/request-v2.service.ts:305-376`).
   - Leave creation TOCTOU race condition (`src/modules/request-v2/request-v2.service.ts:136-154`) allowing overlapping leaves due to missing database exclusion constraints.
   - 40-hour monthly OT cap race condition without advisory locks.
   - Attendance V2 timesheet lock overwrite (`attendance-v2.repository.ts:99-119`) where in-flight punch calculations write `is_locked: excluded.is_locked`, silently unlocking locked payroll periods.
   - Schedule overwrite race condition (`attendance-v2.repository.ts:392-418`) where `ensureDefaultSchedule` check-then-act races with overtime approval, overwriting approved overtime back to planned schedules.
   - Missing transaction boundaries and advisory locks in `recordPunch`.
   - Payroll V2 date range formatting logic error `${month}-31` on PostgreSQL `DATE` column (`src/data/payroll-v2.repository.ts:96`), causing PostgreSQL to throw `date/time field value out of range` on all 5 months with < 31 days (Feb, Apr, Jun, Sep, Nov), silently swallowed by empty `catch {}` in `PayrollV2Service.generatePeriodPayslips`, returning 0 payslips for the entire company.
   - Unbounded lifetime query in Payroll V2 (`src/data/payroll-v2.repository.ts:107-113`) where `system_requests` is queried without date/month filtering, cumulatively summing all historical OT and advances onto every single monthly payslip.
   - Audit Log PK collision (`src/platform/db.ts:453-460`) where in-memory `last.id + 1` computation causes unique constraint violations `23505` on concurrent writes, rolling back the caller's business transaction.
   - Payroll run constraint collisions (`src/data/payroll.repository.ts:61-73`) where `MAX(run_no) + 1` without locking crashes concurrent period calculations on `UNIQUE (month, run_no)`.
   - Event loop blocking & connection pool starvation (`src/domain/period/periods.ts:349-384`, `src/platform/db.ts:936-937`) where synchronous `zlib.gzipSync` executes inside open database transactions during employee payroll batch loops.
   - Multi-replica cache invalidation failure (`src/ops/compute-cache.ts:37-52`, `src/ops/shared-cache.ts:6-10`) where process-local `writes` counter fails in clustered deployments, leading to stale payroll reads and cache stampedes.
   - Employee blind overwrite on duplicate username (`src/modules/employee-v2/employee-v2.service.ts:204-241`) silently overwriting existing employees with new UUIDs and breaking foreign keys.
   - Lost updates in slip override edits (`src/platform/db.ts:1316-1333`) despite optimistic check due to lack of row locking (`FOR UPDATE`).
   - Background execution risks: `LeaveAccountService.start()` floating promise and overlapping intervals; dead `punch_requests` periodic purge; connection pool capped at 10 with no timeouts; SSE heartbeat query storm (N queries every 25 seconds).
4. **Pure Logic Verification & Redundancy Detection**:
   - Request V2 privilege escalation where caller can spoof `employeeId` and `reviewerId`.
   - Abandoned dynamic attributes system (`src/params/attributes.ts`, 295 lines).
   - Orphaned `src/domain/position/seed-data.ts` and `src/engine/attendance-status.ts`.
   - Superfluous passthrough wrapper `src/domain/payroll/payroll-service.ts`.
5. **Architectural Remediation Roadmap & Prioritized Recommendations**:
   - Concrete, phased architecture plan: Schema Unification & Legacy Cleanup, Concurrency & Locking Framework, Persistence & API Reconciliation, and Resiliency / Operational Hardening.
