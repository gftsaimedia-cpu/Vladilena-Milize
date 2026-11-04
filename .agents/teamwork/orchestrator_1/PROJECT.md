# Project: Vladilena-Milize Concurrency & Tech Debt Architecture Audit

## Architecture & Scope
Audit of the Vladilena-Milize backend with focus on:
- Backend V2 aggregates: Payroll V2, Attendance V2, Employee V2, Request V2, and `ui-bridge` compatibility layer.
- Legacy V1 reuse: models, services, repositories, raw queries, data sync discrepancies, model impedance mismatches, transition debt.
- Concurrency, race conditions, advisory locks: PostgreSQL advisory lock usage, transaction boundaries, batch calculations, attendance processing, state transitions.
- Background execution: jobs, queues, workers, collision risks.
- Pure logic verification: redundant, dead, or nonsensical code constructs.

Deliverable target: `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md` and direct comprehensive in-chat report.

## Feature / Investigation Inventory
| # | Area / Topic | Focus | Assigned Explorer | Source |
|---|--------------|-------|-------------------|--------|
| 1 | Backend V2 & Legacy Reuse | Payroll V2, Attendance V2, Employee V2, Request V2, UI-Bridge legacy dependencies | explorer_v2_legacy | ORIGINAL_REQUEST §R2 |
| 2 | Concurrency & Advisory Locks | Race conditions, advisory locks, transaction boundaries, batch payroll, state transitions | explorer_concurrency | ORIGINAL_REQUEST §R3 |
| 3 | Background Jobs & Dead Logic | Background queues/jobs, execution collisions, dead code, redundant wrappers/abstractions | explorer_background_logic | ORIGINAL_REQUEST §R3, §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Deep Code Investigation | 3 parallel explorers inspecting source logic | none | DONE |
| M2 | Synthesis & Report Draft | Worker drafting `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md` | M1 | DONE |
| M3 | Quality & Accuracy Audit | Reviewers verifying file paths, line numbers, snippets, logic accuracy | M2 | DONE |
| M4 | Deliverable Finalization & In-Chat Report | Delivery of findings to caller/parent | M3 | DONE |

## Code Layout & Conventions
- Audit deliverable path: `docs/audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md`
- Agent metadata: `.agents/teamwork/`
- All application source code and tests are strictly READ-ONLY. No edits to source or tests.
