# Reference allowance behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (adapted: implement inline as explicitly assigned). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align active payroll allowance calculations with the approved Downloads reference behavior.

**Architecture:** Keep payroll orchestration and persisted DTOs intact. Add only the necessary per-employee allowance context to the monthly payroll input and calculate allowance results consistently for daily rows and aggregate totals, leaving base salary, workday denominator, OT, KPI, and deductions outside this change.

**Tech Stack:** NestJS, TypeScript, PostgreSQL/Kysely, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-04-reference-allowances.md`

## Global Constraints

- Preserve the existing payroll controller, response DTO shape, and historical payslip snapshots.
- Do not alter the 26-day denominator, base-salary calculation, OT, KPI, tax, insurance, advance, or payroll lifecycle.
- Use saved `staff.type`, `staff.shift_allowance_pct`, and `staff.idorm`; do not infer NV 40/60 by level.
- Keep FLEX paid hours capped at eight and avoid paying NIGHT break twice.
- No real database writes or deployment.

## Review Focus

- TTS/CTV must use Flex 10% and Night 30%; test both types.
- NV must use Flex 20% and persisted Night 40%/60%; test 60% and default 40%.
- Partial Flex uses paid hours, capped at eight; test a four-hour day.
- Night break is paid only at eight+ hours and scales with Night rate; test under/at boundary.
- NV-only monthly allowances respect iDorm, exclude completed persisted makeup dates from allowance-eligible work days, and use the four-net-absence-day eligibility limit.
- Makeup is sourced from `work_schedules.schedule_type = MAKE_UP` joined on employee/date, and only counts with positive-work PRESENT attendance; leave requests do not provide makeup completion evidence.
- Missing/unrecognized employee type must not gain NV-only allowances.

---

### Task 1: Allowance calculation regression coverage and implementation

**Files:**
- Modify: `src/modules/payroll/payroll.repository.ts` (join monthly timesheets to persisted work schedules)
- Modify: `src/modules/payroll/payroll.service.ts`
- Modify: `src/modules/payroll/domain/employee-payslip.ts`
- Test: `test/v2/payroll.test.ts`

**Interfaces:**
- Input: monthly staff context with type, individual shift allowance pct, iDorm; existing timesheet shift pct/work hours; monthly approved leave/request data where already available.
- Output: existing `EmployeePayslipDTO` allowance policy/actual fields and daily line fields; no public DTO shape changes.

- [x] Write tests for TTS/CTV/NV Flex/Night and saved NV 40/60 selection.
- [x] Run the focused test to observe expected failures.
- [x] Write tests for partial Flex, Night break boundary, iDorm, absence threshold, makeup offset, and non-NV exclusion.
- [x] Run the focused tests and confirm they fail on current behavior.
- [x] Implement the smallest coherent wiring/formulas that pass while retaining existing non-allowance values.
- [x] Run focused payroll tests, typecheck, scoped format, and full test suite. (`spec:check` is not defined in package scripts.)
- [x] Review diff for DTO/snapshot compatibility and confirm workday denominator remains 26.

### Review correction: persisted makeup schedules

The initial makeup-count implementation inferred completion from an approved request's date and matching attendance. Review found this was not the persisted source of truth and did not remove makeup workdays from monthly allowance ratios. The corrected design joins monthly `timesheet_entries` to unique `work_schedules` rows by employee/date, derives a set of completed `MAKE_UP` dates from PRESENT rows with positive work hours, and applies that set only to allowance eligibility and daily Flex/Night extras. Existing base workday counts and pay remain unchanged.
