# BRIEFING — 2026-11-04T07:05:00Z

## Mission
Conduct an in-depth audit of background execution risks, queue/job execution, and pure logic verification (redundancy, dead code, nonsensical constructs) in Vladilena-Milize.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, background_logic
- Working directory: C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_background_logic\
- Original parent: a043682d-be92-4dd4-baf0-f70c98cfedab
- Milestone: Audit-2026-11-concurrency-techdebt

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- STRICTLY READ-ONLY: DO NOT modify any application source code or test files.
- DO NOT read or rely on code comments instead of analyzing actual implementation logic.
- DO NOT read test code or run test suites to infer system behavior (verify logic directly from implementation source code).
- For EVERY finding you report: exact file path, exact line numbers, verbatim code snippet, technical explanation based strictly on code logic.

## Current Parent
- Conversation ID: a043682d-be92-4dd4-baf0-f70c98cfedab
- Updated: 2026-11-04T07:05:00Z

## Investigation State
- **Explored paths**:
  * Core runtime: `src/main.ts`, `src/platform/db.ts`, `src/data/postgres-database.ts`, `src/data/locks.ts`, `src/data/db-dialect.ts`, `src/platform/events.ts`, `src/platform/config.ts`, `src/platform/authz.ts`, `src/http/api-gate.ts`, `src/http/load-control.ts`, `src/ops/route-classes.ts`, `src/ops/runtime-monitor.ts`.
  * Background execution: `src/domain/leave/leave-account-service.ts`, `src/platform/attendance-sessions.ts`, `src/main.ts` purge loop.
  * V2 Aggregates & UI-Bridge: `src/modules/payroll-v2/`, `src/domain/payroll-v2/`, `src/data/payroll-v2.repository.ts`, `src/modules/attendance-v2/`, `src/domain/attendance-v2/`, `src/data/attendance-v2.repository.ts`, `src/modules/request-v2/`, `src/domain/request-v2/`, `src/data/request-v2.repository.ts`, `src/modules/employee-v2/`, `src/domain/employee-v2/`, `src/modules/ui-bridge/`.
  * Dead code & legacy compatibility: `src/domain/position/seed-data.ts`, `src/engine/attendance-status.ts`, `src/params/attributes.ts`, `src/domain/payroll/payroll-service.ts`, `src/data/attendance.repository.ts`.
- **Key findings**:
  1. Background job collisions in `LeaveAccountService.refreshAll` via unhandled `setInterval` floating promise without distributed locking.
  2. Connection pool starvation risk: `pg.Pool` defaults to max 10 connections with 0 timeout (infinite wait); long-running transactions and background tasks hold connections and block the entire server.
  3. SSE Heartbeat storm: `heartbeat()` in `src/platform/events.ts` fires a sequential database query per connected client every 25 seconds.
  4. Date range crash in `PayrollV2Repository`: `${month}-31` crashes on PostgreSQL `DATE` column in months with < 31 days; swallowed by empty catch block causing complete calculation failure.
  5. Lifetime request leakage in `PayrollV2Repository`: All historical approved OT and advance requests are summed and applied to every monthly payslip.
  6. Route authorization block: `PayrollV2Controller` (`/api/v2/payroll`) is absent from `ROUTE_CAPS` and `routeKey`, causing `ApiGate` to reject all calls with 403 `NO_ROUTE_POLICY`.
  7. Fake / stub endpoints in `UiBridgeController`: `putSheetBulk`, `putStaffShiftBulk` do nothing and return fake success; `getToday` returns hardcoded dummy statuses.
  8. Missing advisory locks and transaction boundaries across V2 punch recording and request approval side effects.
  9. Unauthenticated employee ID and reviewer ID spoofing in `RequestV2Controller`.
  10. Dead code & wrappers: `attributes.ts` (295 lines), `seed-data.ts` (38 lines), `attendance-status.ts` (62 lines), `payroll-service.ts` (3-line pass-through), `punch_requests` purge loop.
- **Unexplored areas**: Investigation completed. Ready to produce comprehensive handoff report.

## Key Decisions Made
- Structured findings into: (1) Background Execution & Async Workflow Risks, (2) Concurrency, Race Conditions & Lock Deficiencies, (3) Pure Logic Bugs & Data Corruption in V2, (4) Dead Code, Redundant Wrappers & Fake Stubs, and (5) Historical Tech Debt Delta.
- Document every finding with verbatim code snippet, exact line range, and rigorous logic breakdown.

## Artifact Index
- `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_background_logic\DISPATCH.md` — Dispatch record
- `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_background_logic\progress.md` — Liveness and progress tracking
- `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_background_logic\handoff.md` — Final audit report deliverable
