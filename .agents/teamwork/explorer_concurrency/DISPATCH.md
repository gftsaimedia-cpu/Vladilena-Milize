# Dispatch for Explorer 2: Concurrency, Race Conditions & Advisory Locks

Authoritative request file: C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\ORIGINAL_REQUEST.md
Working directory: C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\

## Objective
Analyze concurrent workflows across the Vladilena-Milize system for race conditions, advisory lock issues, and transaction boundary flaws.

## Key Targets
1. Concurrency hotspots:
   - Payroll batch calculations and execution
   - Attendance ingestion, punch processing, timesheet generation
   - Request state transitions (leave, overtime, approval flows, double approvals/rejections)
2. PostgreSQL advisory locks:
   - Identify every advisory lock acquisition / release in the codebase
   - Lock key hashing / integer generation collision vulnerabilities
   - Session vs transaction scope mismatches (`pg_advisory_lock` vs `pg_advisory_xact_lock`)
   - Lock leaks on error/exception paths
   - Critical sections lacking concurrency protection
3. Transaction boundary flaws:
   - Non-atomic multi-table updates
   - External calls / I/O inside transactions or transactions held too long
   - Inappropriate isolation levels or lack of `SELECT FOR UPDATE` where needed

## Strict Rules & Constraints
- Strictly READ-ONLY analysis: DO NOT modify any source code or test files.
- DO NOT read or rely on code comments — inspect actual code execution logic.
- DO NOT read test files or run test suites to infer system behavior — inspect implementation source code directly.
- Every reported finding MUST include:
  1. Exact file path
  2. Exact line number range
  3. Verbatim source code snippet
  4. Precise technical explanation of the concurrent interleaving failure scenario

Deliver complete report to: `C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\handoff.md`.


## 2026-11-04T06:39:05Z
[Message] timestamp=2026-11-04T06:39:05Z sender=a043682d-be92-4dd4-baf0-f70c98cfedab priority=MESSAGE_PRIORITY_HIGH
You are Explorer 2 (Concurrency & Advisory Locks Explorer).
Your working directory: C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\

MANDATORY FIRST STEP:
Read C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\ORIGINAL_REQUEST.md and C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\DISPATCH.md before doing anything else.

## Task Objective
Conduct an in-depth, code-level concurrency and race conditions audit across Vladilena-Milize.

## Key Focus Areas
1. Concurrency Hotspots:
   - Payroll batch calculations and multi-employee payroll processing.
   - Attendance ingestion, punch processing, timesheet aggregation, and biometric sync.
   - Request state transitions (leave requests, overtime, approval flows, double approvals/rejections, race conditions when two approvers act simultaneously).
2. PostgreSQL Advisory Locks:
   - Search the entire codebase for all advisory lock usages (e.g. `pg_advisory_lock`, `pg_advisory_xact_lock`, `pg_try_advisory_lock`, or ORM equivalents).
   - Evaluate lock key generation (e.g. integer hashing collisions, 32-bit vs 64-bit key collisions, tenant ID collision).
   - Session vs transaction scope mismatches (e.g. using session locks that leak on connection pools vs transaction locks).
   - Check error/exception handling paths for lock leaks.
   - Identify critical sections that lack necessary locking entirely.
3. Transaction Boundaries & Isolation:
   - Check transaction boundaries (atomic vs non-atomic operations, autocommit behavior, operations occurring outside active transactions).
   - Check for missing row-level locks (`SELECT ... FOR UPDATE`) vs advisory locks.
   - Identify potential dirty reads, lost updates, or concurrent data corruption scenarios.

## Strict Audit Rules (INTEGRITY MODE: DEMO)
- STRICTLY READ-ONLY: DO NOT modify any application source code or test files.
- DO NOT read or rely on code comments instead of analyzing actual implementation logic.
- DO NOT read test code or run test suites to infer system behavior (verify logic directly from implementation source code).
- For EVERY finding you report:
  * Exact file path
  * Exact line number range
  * Verbatim source code snippet
  * Technical explanation of the failure mode, race condition interleaving sequence, or lock flaw based strictly on code logic.

## Output
Write your comprehensive investigation report to:
`C:\Users\52.AI UD\Project\Vladilena-Milize\.agents\teamwork\explorer_concurrency\handoff.md`
Update your `progress.md` regularly.
When finished, send a message back to the orchestrator using `send_message` with a summary and reference to your handoff.md.
