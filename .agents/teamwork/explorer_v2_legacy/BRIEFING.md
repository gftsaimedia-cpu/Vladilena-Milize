# BRIEFING — 2026-11-04T06:55:00Z

## Mission
Conduct an in-depth, code-level architecture audit focusing on Backend V2 modules, legacy V1 reuse, and the ui-bridge layer in Vladilena-Milize.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_v2_legacy\
- Original parent: a043682d-be92-4dd4-baf0-f70c98cfedab
- Milestone: V2 Architecture & Legacy Reuse Code Audit

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify application/test files
- Do NOT rely on code comments — inspect actual code logic
- Do NOT read test files or run test suites to infer system behavior
- Exact file paths, line number ranges, verbatim snippets, and technical explanations for all findings
- Output deliverable: `handoff.md`

## Current Parent
- Conversation ID: a043682d-be92-4dd4-baf0-f70c98cfedab
- Updated: 2026-11-04T06:55:00Z

## Investigation State
- **Explored paths**:
  * Backend V2: `src/modules/payroll-v2/`, `src/domain/payroll-v2/`, `src/data/payroll-v2.repository.ts`, `src/modules/attendance-v2/`, `src/domain/attendance-v2/`, `src/data/attendance-v2.repository.ts`, `src/modules/employee-v2/`, `src/domain/employee-v2/`, `src/data/employee-v2.repository.ts`, `src/modules/request-v2/`, `src/domain/request-v2/`, `src/data/request-v2.repository.ts`.
  * UI Bridge: `src/modules/ui-bridge/ui-bridge.controller.ts`, `web/src/services/*`.
  * Legacy V1 & Persistence: `src/data/legacy-schema.ts`, `migrations/postgres/0001_baseline.sql`, `src/data/schema.generated.ts`, `src/platform/db.ts`, `src/domain/period/periods.ts`, `src/params/payroll-preview.ts`, `src/data/attendance.repository.ts`, `src/data/records.repository.ts`, `src/data/catalog.repository.ts`, `src/data/advance-approvals.repository.ts`, `src/data/pay.repository.ts`, `src/modules/approvals/approvals.controller.ts`, `src/modules/advance/advance.controller.ts`, `src/modules/leave/leave.controller.ts`, `src/modules/staff/staff.controller.ts`.
- **Key findings**:
  1. Complete dual-world architectural split: 12 legacy tables (`timesheets`, `attendance_sessions`, `punches`, `sheet_approvals`, `punch_requests`, `corrections`, `explanations`, `leave_ledger`, `advance_requests`, `advance_approval_months`, `advance_approval_entries`) were dropped from PostgreSQL, but V1 legacy repositories still query them via `LegacySchema`.
  2. Silent data corruption in official payroll: `periods.calculate` runs on empty attendance/timesheets because `store.getSheet()` and `store.listSessions()` swallow table-not-found errors and return `{ days: {} }` and `[]`. Official payslips are generated with 0 workdays and 0 hours.
  3. Payroll V2 zero-persistence: `PayrollV2Service` runs entirely in memory and returns JSON; it never persists to `payroll_runs` or `payslips`. The web client does not call `/api/v2/*` at all.
  4. Payroll V2 calculation flaws: hardcoded standard workdays (26), hardcoded OT rate (100% at 200%), hardcoded Flex allowance (20% vs 10% in Shift class), hardcoded Night off-paid (37,500), hardcoded late/early deduction constant (-16,827), hardcoded tax exempt (+34,615), blind 10.5% insurance deduction without checking `staff.insured`, KPI threshold boundary bug (`> 1`).
  5. UI Bridge mock and no-op stubs: `GET /api/today` hardcodes all staff as checked-out with null times; `PUT /api/sheet/bulk` and `PUT /api/staff/shift-bulk` are no-ops; missing endpoints `PUT /ot` and `POST /explanations/:id/decide` cause 404s.
  6. Attendance V2 flaws: time zone heuristic guesses UTC vs local; work duration calculation omits lunch break subtraction (`actualDurationHours = (lastOut - firstIn)/3600000`); no transactions or advisory locks in `recordPunch`.
  7. Employee V2 runtime crash: `DELETE /api/v2/employees/:username` calls `this.service.delete()`, which does not exist in `EmployeeV2Service` (uncaught TypeError); `EmployeeV2Repository` is completely orphaned and dead code.
  8. Request V2 concurrency risks: un-transactioned multi-day leave approval loops; un-locked OT cap check allowing concurrent requests to breach 40h month limit; absence of optimistic locking (`rev`).
- **Unexplored areas**: None within the assigned audit boundary.

## Key Decisions Made
- Structure handoff report strictly following the 5-component protocol with exact file paths, line ranges, verbatim code snippets, and in-depth technical explanations.

## Artifact Index
- `BRIEFING.md` — persistent memory
- `progress.md` — heartbeat and task status
- `handoff.md` — comprehensive 5-component report
