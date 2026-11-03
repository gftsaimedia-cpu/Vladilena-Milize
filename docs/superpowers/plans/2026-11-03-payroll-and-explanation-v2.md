# Payroll V2 (GFT Payslip) & Attendance Explanation V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Payroll V2 engine with the complete GFT Payslip Aggregate (`DailyAttendanceLine` and `EmployeePayslip`) matching 100% of the October 2026 canonical payslip, and implement the Attendance Explanation workflow (Task 2) where approving an explanation sets `timesheet_entries.day_status = 'VALID'`. Punitive sanctions remain deferred.

**Architecture:** Domain-Driven Design (DDD) with clean V2 aggregates. `EmployeePayslip` models all items from the GFT 2-page payslip (Daily attendance lines, base salary, paid leave, iSAT, overtime, allowances, KPI bonus, late/early deductions, taxes, insurances, advance, and net income). `RequestV2Service` processes `'EXPLANATION'` requests and synchronizes attendance `day_status`.

**Tech Stack:** TypeScript (strict), Node 22.13, PostgreSQL, Kysely query builder, Node built-in test runner.

**Spec:** [docs/superpowers/specs/2026-11-03-payroll-and-explanation-v2-design.md](file:///C:/Users/52.AI%20UD/Vladilena-Milize/docs/superpowers/specs/2026-11-03-payroll-and-explanation-v2-design.md)

---

## Global Constraints

- Sanctions / punitive monetary penalties are strictly out of scope. Rejecting an explanation request does not apply financial penalties.
- All composite rounding and monetary values must match the GFT October 2026 sample payslip to within 1 VND.
- Maintain documentation integrity and preserve unrelated existing code/comments.
- Every commit must pass `npm.cmd run typecheck` and `npm.cmd run spec:check`.

---

## Review Focus

1. **Precision of Base & Day Rate:** Day rate must be calculated as `baseSalary / standardWorkdays` and rounded consistently when computing composite allowances and daily salaries.
2. **Shift Allowance Calculation:** Flex allowance (+20% of day salary) and Night allowance (+40% of day salary) plus Off Paid (37,500 VND per night) must accurately match the daily attendance items and monthly totals.
3. **KPI Weighted Multipliers:** KPI score must correctly apply weights: Wework (40%), User (24%), Peer (18%), Manager (12%), Self (6%) to calculate the exact percentage and actual KPI pay.
4. **Explanation Approval Isolation:** Approving an explanation request must only alter `day_status` to `'VALID'` for that specific `(employee_id, work_date)` without mutating unrelated dates or fields.
5. **Net Income Reconcile:** Ensure `grossIncome - insuranceDeduction - personalIncomeTax - advanceDeduction == netIncome`.

---

## File Structure

```
src/
├── domain/
│   ├── payroll-v2/
│   │   ├── employee-payslip.ts      # DailyAttendanceLineProps & EmployeePayslip Aggregate
│   │   ├── payroll-v2-service.ts    # Payroll calculation service
│   │   └── index.ts                 # Module exports
│   └── request-v2/
│       ├── system-request.ts        # Extended with 'EXPLANATION' request type
│       └── request-v2-service.ts    # Review logic transitioning day_status to 'VALID'
├── data/
│   └── payroll-v2.repository.ts     # Data loader for monthly timesheets, requests, params, and staff
test/
└── unit/
    ├── employee-payslip.test.ts     # Unit tests verifying GFT October 2026 payslip numbers down to 1 VND
    ├── explanation-request.test.ts  # Unit tests for explanation workflow
    └── payroll-v2-service.test.ts   # Integration & service-level test
```

---

## Task List

### Task 1: Domain Models `DailyAttendanceLine` & `EmployeePayslip`

**Files:**
- Create: `src/domain/payroll-v2/employee-payslip.ts`
- Create: `test/unit/employee-payslip.test.ts`
- Create: `src/domain/payroll-v2/index.ts`

- [ ] **Step 1: Write failing unit test for `EmployeePayslip` using GFT October 2026 sample data**
  - Verify all properties match Page 1 and Page 2:
    - Base salary: 6,000,000 policy vs 5,538,462 actual (24/26 days).
    - Leave & iSAT: 1 paid leave (230,769) + 1 iSAT (230,769).
    - OT: 5 hours x2.0 = 288,462.
    - Allowances: Attendance 1,384,615, Travel 830,769, Flex 138,462, Night 276,923, Off Paid 112,500. Total = 2,743,269.
    - KPI: Wework 85%, User 90%, Peer 80%, Manager 85%, Self 90% -> 85.6% -> 5,136,000.
    - Deduction: Late/early 0.58h -> -16,827.
    - Gross: 14,150,904.
    - Insurances: 630,000 (10.5%).
    - Advance: 2,025,000.
    - Net: 11,495,904.

- [ ] **Step 2: Run test to confirm it fails**
  - Run: `node scripts/dev/ts.cjs --test test/unit/employee-payslip.test.ts`

- [ ] **Step 3: Implement `DailyAttendanceLine` and `EmployeePayslip` in `src/domain/payroll-v2/employee-payslip.ts`**
  - Implement full class constructor, validation, calculations, `.toSummary()`, `.toDailyLines()`, and `.toJSON()`.

- [ ] **Step 4: Run test to confirm it passes**
  - Run: `node scripts/dev/ts.cjs --test test/unit/employee-payslip.test.ts`

- [ ] **Step 5: Export from `src/domain/payroll-v2/index.ts` and verify typecheck**
  - Run: `npm.cmd run typecheck`

- [ ] **Step 6: Commit Task 1**
  - Message: `feat(payroll-v2): add EmployeePayslip and DailyAttendanceLine models`

---

### Task 2: Attendance Explanation Request Workflow

**Files:**
- Modify: `src/domain/request-v2/system-request.ts`
- Modify: `src/domain/request-v2/request-v2-service.ts`
- Create: `test/unit/explanation-request.test.ts`

- [ ] **Step 1: Write failing unit test for Explanation request submission and approval**
  - Test employee submitting `'EXPLANATION'` request for a date with `day_status = 'NEEDS_EXPLANATION'`.
  - Test approval: transitions request to `'APPROVED'` and updates `timesheet_entries.day_status` to `'VALID'`.
  - Test rejection: transitions request to `'REJECTED'` and keeps `timesheet_entries.day_status = 'NEEDS_EXPLANATION'` without financial fines.

- [ ] **Step 2: Run test to confirm it fails**
  - Run: `node scripts/dev/ts.cjs --test test/unit/explanation-request.test.ts`

- [ ] **Step 3: Implement `'EXPLANATION'` handling in `SystemRequest` and `RequestV2Service`**
  - Support `type: 'EXPLANATION'`.
  - In `reviewRequest(requestId, 'APPROVE')`: if request type is `'EXPLANATION'`, fetch target work date and call `attendanceRepo.updateDayStatus(employeeId, workDate, 'VALID')`.

- [ ] **Step 4: Run test to confirm it passes**
  - Run: `node scripts/dev/ts.cjs --test test/unit/explanation-request.test.ts`

- [ ] **Step 5: Verify typecheck & spec check**
  - Run: `npm.cmd run typecheck; npm.cmd run spec:check`

- [ ] **Step 6: Commit Task 2**
  - Message: `feat(request-v2): implement explanation request approval to validate timesheet day_status`

---

### Task 3: `PayrollV2Repository` & `PayrollV2Service` Integration

**Files:**
- Create: `src/data/payroll-v2.repository.ts`
- Create: `src/domain/payroll-v2/payroll-v2-service.ts`
- Create: `test/unit/payroll-v2-service.test.ts`

- [ ] **Step 1: Write failing test for `PayrollV2Service.generateMonthlyPayslip`**
  - Seed or mock repository with employee monthly entries:
    - 24 valid work days (3 flex, 3 night, 18 normal).
    - 1 paid leave request, 1 iSAT day, 1 unpaid leave day.
    - 1 approved OT request (5h).
    - 2 punch days with late arrivals (15m, 20m).
    - 1 approved advance request (2,025,000 VND).
    - Position NV Bậc 1 (6,000,000 VND base, 26 standard days).
    - KPI score 85.6%.
  - Verify generated `EmployeePayslip` equals exactly the GFT October 2026 values.

- [ ] **Step 2: Run test to confirm it fails**
  - Run: `node scripts/dev/ts.cjs --test test/unit/payroll-v2-service.test.ts`

- [ ] **Step 3: Implement `PayrollV2Repository` and `PayrollV2Service`**
  - Query `timesheet_entries`, `work_schedules`, `system_requests`, `kpi_scores`, `position_levels`, `position_types`, and `staff`.
  - Assemble daily lines and monthly aggregates into `EmployeePayslip`.

- [ ] **Step 4: Run test to confirm it passes**
  - Run: `node scripts/dev/ts.cjs --test test/unit/payroll-v2-service.test.ts`

- [ ] **Step 5: Verify typecheck and spec sync**
  - Run: `npm.cmd run typecheck; npm.cmd run spec:check`

- [ ] **Step 6: Commit Task 3**
  - Message: `feat(payroll-v2): add PayrollV2Repository and PayrollV2Service`

---

### Task 4: Verification, Spec Regeneration, and Git Push

**Files:**
- Modify: `docs/superpowers/PROGRAM.md` (record progress)
- Generated docs: `spec/` (via `npm run spec:gen`)

- [ ] **Step 1: Run complete test suite and code quality checks**
  - Run: `npm.cmd run typecheck`
  - Run: `node scripts/dev/ts.cjs --test test/unit/employee-payslip.test.ts test/unit/explanation-request.test.ts test/unit/payroll-v2-service.test.ts test/unit/attendance-v2.test.ts test/unit/request-v2.test.ts`
  - Run: `npm.cmd run spec:gen`
  - Run: `npm.cmd run spec:check`

- [ ] **Step 2: Commit all changes and push to GitHub remote**
  - Run: `git status`
  - Run: `git add .`
  - Run: `git commit -m "feat(payroll-v2): complete payroll v2 aggregate and explanation request workflow"`
  - Run: `git push origin main`
