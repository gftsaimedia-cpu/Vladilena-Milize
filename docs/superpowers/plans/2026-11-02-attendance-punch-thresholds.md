# Attendance Punch Thresholds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the attendance boundaries and absence flags specified in `docs/superpowers/specs/2026-11-02-attendance-punch-thresholds-design.md`.

**Architecture:** Preserve immutable actual punch times and existing payroll formulas. Change thresholds in the domain rule, enforce re-entry/absence eligibility at the domain/API boundary, and expose only attendance review flags through attendance-facing responses.

**Tech Stack:** TypeScript, NestJS, Node test runner, PostgreSQL/PGlite.

**Spec:** `docs/superpowers/specs/2026-11-02-attendance-punch-thresholds-design.md`

## Global Constraints
- Check-in: 0–15 normal, 16–30 late, greater than 30 flagged forgotten check-in and requires explanation.
- Check-out at least 30 minutes after allowed end requires explanation; preserve approved OT extensions.
- Early checkout requires explanation, stores actual time and ends the shift; no same-work-date re-entry.
- No-punch absence only after scheduled work ends, with no active leave and no punches; both missing-side flags attach to work date.
- No payroll deduction rule changes.

## Review Focus
- Minute boundaries are tested at 15/16/30/31 and 29/30.
- Overnight shifts attach flags to start date and do not block another work date.
- Pending/approved leave suppress absence; rejected/cancelled leave does not.
- Future and unscheduled dates never receive absence flags.
- Attendance flags do not change payroll entries or deduction totals.

### Task 1: Punch thresholds and same-shift re-entry

**Files:** `src/domain/explanation/late-checkout.ts`, `src/modules/attendance/attendance.controller.ts`, focused tests under `test/unit` and `test/api`.

- [ ] Add tests for late checkout 29/30 (including OT extension), late check-in 15/16/30/31, early checkout explanation, same-work-date re-entry block, and next-work-date eligibility.
- [ ] Run focused tests and confirm failures.
- [ ] Implement minimal boundary and re-entry changes while preserving `presIn`/`presOut` and payroll behavior.
- [ ] Run focused tests and relevant payroll regression tests.

### Task 2: Absence and forgotten-side flags

**Files:** `src/domain/explanation/absent-day.ts`, explanation/attendance handlers and response view as required, focused tests under `test/unit` and `test/api`.

- [ ] Add tests for no sessions, overnight ownership, active leave statuses, future dates, off-schedule dates, and both missing-side flags.
- [ ] Run tests and confirm failures.
- [ ] Implement status and response changes without changing payroll state.
- [ ] Run focused tests plus payroll regression tests.

### Task 3: Spec and final verification

**Files:** `spec/attendance.md` and directly relevant generated references only.

- [ ] Update contract/behavior documentation to match the implementation.
- [ ] Run targeted API/unit tests, typecheck and spec consistency checks.
- [ ] Inspect diff for unrelated changes and verify branch/worktree/base identity.
