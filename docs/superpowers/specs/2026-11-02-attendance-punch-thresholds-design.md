# Attendance Punch Thresholds — Design

## Goal
Apply the requested minute boundaries to punch explanations and re-entry while preserving stored punch timestamps and existing payroll calculation rules.

## Decisions
- Check-in at 0–15 minutes late remains normal; 16–30 is the existing late case; after 30 minutes is still a late punch requiring explanation, with a distinct forgotten-check-in flag in attendance views. Preserve actual `presIn` and do not change `ActualHours` deductions.
- Early check-out uses the existing explanation-on-punch flow and actual `presOut`. A closed session that checked out before its planned end blocks another check-in for that same planned work date. A different work date remains eligible.
- Late check-out explanation boundary changes from `> 30` to `>= 30`; approved OT extension remains part of the comparison.
- A no-punch absence requires a completed scheduled work date, no session on that work date, and no active full-day leave declaration/approval (pending and approved count; cancelled/rejected do not). Both forgotten-in and forgotten-out flags belong to the scheduled work date, including overnight shifts. Absence is a review flag only; it must not change payroll state or future/off-schedule days.
- Keep employee explanation routes and status model as the explanation path; expose a distinct `forgot-in` attendance flag without changing payroll entry kinds. If the existing data model cannot express that safely, stop and report the specific gap.

## Files / boundaries
- Pure rule: `src/domain/explanation/late-checkout.ts`.
- Punch flow and same-shift re-entry: `src/modules/attendance/attendance.controller.ts` plus attendance helper/domain as needed.
- Forgotten-in presentation/classification: `src/domain/attendance/session-status.ts`, alert/attendance views only where required.
- No-punch absence eligibility: `src/domain/explanation/absent-day.ts` and its repository/service callers.
- Tests first in matching `test/unit` and `test/api`; update `spec/attendance.md` and generated references only after behavior is pinned.
- Do not modify admin attendance editor files currently dirty in the shared checkout: `DayDetailDialog.vue`, `TimesheetView.vue`, or `web/src/services/admin-attendance.ts`.

## Review focus
- Exact boundaries: 15/16/30/31 check-in, 29/30 check-out.
- Overnight sessions and another shift/work date after early checkout.
- Pending/approved/rejected/cancelled leave and absent flag date ownership.
- Future/off-schedule absence exclusion and no salary formula or deduction drift.
