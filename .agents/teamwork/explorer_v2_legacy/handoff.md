# Handoff Report — Explorer 1: Backend V2 Architecture & Legacy Reuse Inspection

## 1. Observation

Direct code-level inspection of Backend V2 aggregates, UI-Bridge, and legacy V1 code paths revealed critical architectural discrepancies, dual-model divergence, silent data corruption, runtime crashes, and missing synchronization.

---

### Finding 1: Dual-Schema Schism & Legacy Repositories Querying Dropped Physical Tables

#### 1.1 `src/data/legacy-schema.ts`: Lines 1–21
```typescript
import type { Schema } from './schema.generated';

/**
 * Kiểu tương thích cho các repository cũ của V1 trong quá trình chuyển đổi sang V2.
 * Cho phép mã cũ biên dịch trong khi các bảng vật lý đã được DROP khỏi PostgreSQL schema.
 */
export type LegacySchema = Schema & {
  attendance_days: any;
  attendance_sessions: any;
  punches: any;
  timesheets: any;
  sheet_approvals: any;
  punch_requests: any;
  corrections: any;
  explanations: any;
  leave_ledger: any;
  advance_requests: any;
  advance_approval_months: any;
  advance_approval_entries: any;
};
```

#### 1.2 `migrations/postgres/0001_baseline.sql`: Lines 1–4
```sql
-- Lược đồ chuẩn PostgreSQL cho hệ thống Lương Nhân Sự.
-- Gồm 20 bảng chuẩn nghiệp vụ (10 danh mục & cấu hình + 7 tính lương + 3 chấm công & yêu cầu V2).
-- Số liệu tiền dùng BIGINT; id tự tăng dùng IDENTITY; UUID dùng UUID hoặc TEXT; các ràng buộc toàn vẹn bảo vệ qua PL/pgSQL triggers.
```
**Technical Observation**: In PostgreSQL baseline, the physical tables `attendance_days`, `attendance_sessions`, `punches`, `timesheets`, `sheet_approvals`, `punch_requests`, `corrections`, `explanations`, `leave_ledger`, `advance_requests`, `advance_approval_months`, and `advance_approval_entries` do NOT exist. They were replaced by V2 tables: `system_requests`, `work_schedules`, `punch_events`, and `timesheet_entries`. However, `LegacySchema` adds these 12 dropped table names as `any` to allow legacy V1 repositories to compile.

#### 1.3 Swallowed Read Failures Resulting in Zeroed Data
- **`src/platform/attendance-sessions.ts` (Lines 36–43)**:
```typescript
    async listSessions({ username, month, date, includeScheduled = false }: any = {}) {
      try {
        const hide = includeScheduled ? null : { origin: ADMIN_ORIGIN, nowIso: now() };
        return (await sessionsRepo.list({ username, month, date }, hide)).map(row);
      } catch {
        return [];
      }
    },
```
- **`src/platform/db.ts` (Lines 1271–1291)**:
```typescript
  async getSheet(u?, month?) {
    try {
      const r = await timesheetsRepo.find(u, month);
      return {
        days: r ? JSON.parse(r.days_json) : {},
        kpiPct: r && r.kpi_pct != null ? r.kpi_pct : null,
        kpiAmt: r && r.kpi_amt != null ? r.kpi_amt : null,
        kpiAdmPct: r && r.kpi_adm_pct != null ? r.kpi_adm_pct : null,
        kpiAdmAmt: r && r.kpi_adm_amt != null ? r.kpi_adm_amt : null,
        rev: r ? r.rev : 0
      };
    } catch {
      return { days: {}, kpiPct: null, kpiAmt: null, kpiAdmPct: null, kpiAdmAmt: null, rev: 0 };
    }
  },
  async setSheet(u?, month?, days?, kpiPct?, kpiAmt?) {
    try {
      await timesheetsRepo.upsertSheet(u, month, JSON.stringify(days), kpiPct ?? null, kpiAmt ?? null, now());
    } catch {
      // Bảng timesheets cũ không còn trên PostgreSQL baseline
    }
  },
```
- **`src/domain/approvals/approvals.ts` (Lines 156–163, 175–182)**:
```typescript
    async list(options: any = {}) {
      try {
        const page = options.limit === undefined ? undefined : { limit: options.limit, offset: options.offset || 0 };
        return (await approvalsRepo.list(approvalFilter(options), page)).map(rowToApproval);
      } catch {
        return [];
      }
    },
...
    async forSheet(username?, month?) {
      try {
        if (!MONTH_RE.test(month)) throw new Error('Tháng phải có dạng YYYY-MM');
        return Object.fromEntries((await approvalsRepo.ofMonth(username, month)).map(r => [r.date, rowToApproval(r)]));
      } catch {
        return {};
      }
    },
```
- **`src/data/advance-approvals.repository.ts` (Lines 19–55)**:
```typescript
  async read(month: string): Promise<{ rev: number; users: Record<string, AdvanceApprovalEntry> }> {
    try {
      const rows = await this.qb
        .selectFrom('advance_approval_months as m')
        .leftJoin('advance_approval_entries as e', 'e.month', 'm.month')
...
    } catch {
      return { rev: 0, users: Object.create(null) };
    }
  }
```

#### 1.4 Unhandled Write Failures Causing 500 Crashes on PostgreSQL
When any write operation is invoked against the legacy endpoints, the repositories execute queries against non-existent tables without `try/catch` wrappers:
- **`src/data/advance-approvals.repository.ts` (Lines 58–65)**:
```typescript
  async save(month: string, entries: { username: string; entry: AdvanceApprovalEntry }[]): Promise<void> {
    if (!entries.length) return;
    await this.qb
      .insertInto('advance_approval_months')
      .values({ month, rev: 0 })
      .onConflict(conflict => conflict.column('month').doNothing())
      .execute();
```
*Failure mode*: `POST /api/advance-approvals/request`, `approve`, `reject`, or `cancel` immediately crashes with PostgreSQL error: `relation "advance_approval_months" does not exist`.
- **`src/data/attendance.repository.ts` (Lines 64–74)**:
```typescript
  async decide(row: { username: string; date: string; rev: number; fingerprint: string }, status: string, by: string, at: string, note: string | null): Promise<number> {
    const result = await this.qb
      .updateTable('sheet_approvals')
      .set({ status, rev: sql<number>`rev + 1`, decided_by: by, decided_at: at, note })
      .where('username', '=', row.username)
      .where('date', '=', row.date)
      .where('rev', '=', row.rev)
      .where('fingerprint', '=', row.fingerprint)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }
```
*Failure mode*: `PUT /api/approvals/decide` executes `approvalsRepo.decide`, throwing PostgreSQL error: `relation "sheet_approvals" does not exist`.
- **`src/data/catalog.repository.ts` (Lines 69–80)**:
```typescript
  eventsOf(staffUuid: string): Promise<Pick<LeaveLedgerRow, 'kind' | 'on_date' | 'days'>[]> {
    return this.qb.selectFrom('leave_ledger').select(['kind', 'on_date', 'days']).where('staff_uuid', '=', staffUuid).orderBy('on_date').orderBy('id').execute();
  }
```
*Failure mode*: `GET /api/leave/ledger` calls `this.domain.leave.ledger.eventsOf(staff.uuid)` (`src/modules/leave/leave.controller.ts:45`), throwing PostgreSQL error: `relation "leave_ledger" does not exist`.

---

### Finding 2: Silent Data Corruption in Official Payroll Calculation Lifecycle

#### 2.1 Official Period Calculation Reads from Dropped Tables
- **`src/domain/period/periods.ts` (Lines 349–368)**:
```typescript
async function calculate(month, { rev }: any, actx?, by?) {
  await precheck(month, rev, ['attendance_locked', 'calculated', 'reviewed']);
  const resolved = await paramsStore.resolve(month);
  return await store.transaction(async () => {
    const inputs = await service.loadInputs(month);
    const run = await store.payroll.createRun(month, {
      engineVersion: Engine.ENGINE_VERSION,
      paramsHash: resolved.hash,
      paramsRev: resolved.rev,
      params: resolved.params,
      switches: service.contextOf(inputs),
      inputsDigest: service.digestOf(inputs),
      by
    });
    let errors = 0;
    for (const [, person] of inputs.people) {
      const slip = slipOf(month, person.staff, inputs, resolved.params);
      if (slip.status === 'error') errors++;
      await store.payroll.addPayslip(run.id, slip);
    }
```
- **`src/params/payroll-preview.ts` (Lines 141–168)**:
```typescript
  for (const staff of staffList) {
    const sheet = await store.getSheet(staff.username, month);
    const history: Record<string, any> = {};
    let cursor = month;
    for (let i = 0; i < lookbackMonths; i++) {
      cursor = previousMonth(cursor);
      history[cursor] = await store.getSheet(staff.username, cursor);
    }
    people.set(
      staff.username,
      JSON.parse(
        JSON.stringify({
          staff,
          days: estimateDays(sheet.days),
          approvals: await store.approvals.forSheet(staff.username, month),
          sessions: (await store.listSessions({ username: staff.username, month })).map(s => ({
            id: s.id,
            state: s.state,
            date: s.date,
            entry: s.entry
          })),
          kpi: await kpiOf(staff.username, month, sheet, kpiRules),
          ...(entriesOf.has(staff.username) ? { entries: entriesOf.get(staff.username) } : {}),
          ...(advanceOf.has(staff.username) ? { advance: true } : {}),
          ...(settleOf.has(staff.username) ? { leaveSettleDays: settleOf.get(staff.username) } : {}),
          ...(lookbackMonths ? { history } : {})
        })
      )
    );
  }
```

**Technical Explanation**:
1. When an administrator calculates a period via `POST /api/periods/:month/calculate`, `periods.calculate()` executes `service.loadInputs(month)`.
2. `loadInputs()` calls `store.getSheet()` and `store.listSessions()`, which query the dropped physical tables `timesheets` and `attendance_sessions`.
3. Because both calls catch the missing table exceptions and return `{ days: {} }` and `[]`, the calculation engine receives completely empty attendance and timesheet data.
4. The system calculates and writes official payslips to `payroll_runs` and `payslips` where every employee has 0 worked days, 0 hours, and 0 OT, completely disregarding the real attendance records accumulated in `timesheet_entries` and `punch_events`.

---

### Finding 3: Payroll V2 Zero-Persistence & Frontend Isolation

#### 3.1 `PayrollV2Service` Calculates Purely In-Memory Without Writing to DB
- **`src/modules/payroll-v2/payroll-v2.controller.ts` (Lines 25–32)**:
```typescript
    try {
      const summaries = await this.service.generatePeriodPayslips(month, employeeIds);
      return {
        month,
        calculated: true,
        count: summaries.length,
        items: summaries
      };
```
- **`src/domain/payroll-v2/payroll-v2-service.ts` (Lines 7–24)**:
```typescript
  async generatePeriodPayslips(month: string, employeeIds?: string[]): Promise<EmployeePayslipSummaryDTO[]> {
    let targets = employeeIds;
    if (!targets || targets.length === 0) {
      const staffList = await this.repo.listEligibleEmployees();
      targets = staffList.map(s => s.uuid);
    }

    const summaries: EmployeePayslipSummaryDTO[] = [];
    for (const empId of targets) {
      try {
        const payslip = await this.generateMonthlyPayslip(empId, month);
        summaries.push(payslip.toSummary());
      } catch {
        // Skip records that cannot be calculated
      }
    }
    return summaries;
  }
```
**Technical Explanation**:
- Neither `PayrollV2Controller`, `PayrollV2Service`, nor `PayrollV2Repository` writes to `payroll_runs`, `payslips`, or `payroll_periods`.
- The generated calculations exist solely in the ephemeral response payload.
- In addition, a grep search across `web/src` for `/api/v2/` returned **0 matches**. The web client only calls `/api/periods/*`, which runs the legacy V1 calculation that produces zeroed-out payslips.

---

### Finding 4: Hardcoding, Magic Constants & Flaws in Payroll V2 Domain Calculations

#### 4.1 Hardcoded Overtime Rates
- **`src/domain/payroll-v2/payroll-v2-service.ts` (Lines 146–150)**:
```typescript
      otHoursByRate: {
        x15: 0,
        x20: totalOtHours,
        x30: 0
      },
```
- **`src/domain/payroll-v2/employee-payslip.ts` (Lines 270–277)**:
```typescript
    this.ot15Hours = props.otHoursByRate?.x15 ?? 0;
    this.ot20Hours = props.otHoursByRate?.x20 ?? 0;
    this.ot30Hours = props.otHoursByRate?.x30 ?? 0;
    this.totalOtHours = this.ot15Hours + this.ot20Hours + this.ot30Hours || totalLineOtHours;

    this.otPayTotal = Math.round(
      this.ot15Hours * hourRate * 1.5 + this.ot20Hours * hourRate * 2.0 + this.ot30Hours * hourRate * 3.0
    );
```
**Technical Explanation**: Under Vietnamese Labor Code (Article 98), regular weekday overtime is paid at 150% (`x15`), weekend overtime at 200% (`x20`), and holiday overtime at 300% (`x30`). `PayrollV2Service` sets `x15: 0` and `x30: 0`, dumping 100% of approved overtime hours into `x20`.

#### 4.2 Hardcoded Shift Allowances vs Domain Model Mismatch
- **`src/domain/payroll-v2/payroll-v2-service.ts` (Lines 51–60)**:
```typescript
      if (shiftCode === 'FLEX') {
        shiftLabel = 'Flex +20%';
        flexAllowancePay = Math.round(0.2 * dayRate);
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'NIGHT') {
        shiftLabel = 'Night +40%';
        nightAllowancePay = Math.round(0.4 * dayRate);
        offPaidPay = 37500;
        inOutText = '22:00–06:00';
        daySalary = Math.round(dayRate);
      }
```
- **`src/domain/employee-v2/shift.ts` (Lines 41–52)**:
```typescript
    } else if (this.type === 'FLEX') {
      if (props.allowancePct !== undefined && props.allowancePct !== 10) {
        throw new Error('Ca FLEX có phụ cấp ca cố định là 10%');
      }
      this.allowancePct = 10;
    } else {
      // NIGHT
      const pct = props.allowancePct ?? 30;
      if (pct !== 30 && pct !== 40 && pct !== 60) {
        throw new Error('Ca NIGHT chỉ nhận phụ cấp ca 30%, 40% hoặc 60%');
      }
      this.allowancePct = pct;
    }
```
**Technical Explanation**:
- `Shift` domain class in Employee V2 enforces `allowancePct = 10` for FLEX (`'Ca FLEX có phụ cấp ca cố định là 10%'`).
- `PayrollV2Service` hardcodes `0.2 * dayRate` (20%) for FLEX.
- `PayrollV2Service` hardcodes `0.4 * dayRate` (40%) and `offPaidPay = 37500` for NIGHT, completely ignoring individual contract allowances and `position_types` settings.

#### 4.3 Hardcoded Special-Case Deduction for 0.58 Hours & Magic Constant
- **`src/domain/payroll-v2/employee-payslip.ts` (Lines 326–331, 345)**:
```typescript
    } else if (Math.abs(this.lateEarlyHours - 0.58) < 0.005) {
      // Canonical 35-minute (7/12 h = 0.5833h) deduction at 28.846,15/h = 16.827 VND
      this.lateEarlyDeductionAmount = -16827;
    } else {
      this.lateEarlyDeductionAmount = -Math.round(this.lateEarlyHours * hourRate);
    }
...
    this.taxExemptIncome = props.taxExemptIncome ?? this.flexAllowanceActual + this.travelAllowanceActual + 34615;
```
**Technical Explanation**: The logic contains an explicit branch checking for `Math.abs(this.lateEarlyHours - 0.58) < 0.005` and hardcoding `-16827` VND, and tax exemption contains a magic constant `+ 34615`.

#### 4.4 Mandatory Social Insurance Deducted Regardless of Staff Status
- **`src/domain/payroll-v2/employee-payslip.ts` (Lines 348–350)**:
```typescript
    // 10.5% mandatory social, health, and unemployment insurance
    this.insuranceDeduction = Math.round(this.baseSalaryPolicy * 0.105);
    this.incomeAfterInsurance = this.grossIncome - this.insuranceDeduction;
```
**Technical Explanation**: The calculation does not inspect whether the employee has `hasInsurance` or `staff.insured = 0` (e.g. interns, seasonal contractors, probation). 10.5% insurance is deducted from all employees.

#### 4.5 KPI Score Normalization Boundary Defect
- **`src/domain/payroll-v2/payroll-v2-service.ts` (Lines 126–132)**:
```typescript
      kpiScoresProps = {
        wework: kpiScore.wework > 1 ? kpiScore.wework / 100 : kpiScore.wework,
        user: kpiScore.user > 1 ? kpiScore.user / 100 : kpiScore.user,
        peer: kpiScore.peer > 1 ? kpiScore.peer / 100 : kpiScore.peer,
        manager: kpiScore.manager > 1 ? kpiScore.manager / 100 : kpiScore.manager,
        self: kpiScore.self > 1 ? kpiScore.self / 100 : kpiScore.self
      };
```
**Technical Explanation**: The database table `kpi_scores` stores integer scores from 0 to 10000 (basis points, where 10000 = 100.00%). If a component score is 1 (meaning 0.01%), `kpiScore.wework > 1` evaluates to `false`, leaving the score as `1.0` (100%), producing a 10,000x calculation inflation.

---

### Finding 5: Attendance V2 Timezone Guessing, Lunch Break Omission & Concurrency Vulnerabilities

#### 5.1 Dynamic Proximity Timezone Heuristic
- **`src/domain/attendance-v2/daily-timesheet.ts` (Lines 103–122)**:
```typescript
  let useUtc = true;
  if (referenceCheckIn) {
    const utcStart = new Date(`${workDate}T${startTimeStr}:00.000Z`).getTime();
    const localStart = new Date(y, m - 1, d, sH, sM, 0, 0).getTime();
    useUtc = Math.abs(referenceCheckIn.getTime() - utcStart) <= Math.abs(referenceCheckIn.getTime() - localStart);
  }

  let plannedStart: Date;
  let plannedEnd: Date;

  if (useUtc) {
    plannedStart = new Date(`${workDate}T${startTimeStr}:00.000Z`);
    const dayOffsetMs = isOvernight ? 86400000 : 0;
    plannedEnd = new Date(new Date(`${workDate}T${endTimeStr}:00.000Z`).getTime() + dayOffsetMs);
  } else {
    plannedStart = new Date(y, m - 1, d, sH, sM, 0, 0);
    plannedEnd = new Date(y, m - 1, d + (isOvernight ? 1 : 0), eH, eM, 0, 0);
  }
```
**Technical Explanation**: The planned shift time is dynamically parsed as either UTC or Server Local Time based on which timestamp is closer to `referenceCheckIn`. If `referenceCheckIn` is null, it defaults to UTC (`${workDate}T${startTimeStr}:00.000Z`). In Vietnam (UTC+7), an 08:00 shift parsed as UTC is 15:00 ICT, skewing boundary comparisons by 7 hours.

#### 5.2 Failure to Deduct Lunch Break in Work Duration
- **`src/domain/attendance-v2/daily-timesheet.ts` (Lines 431–438)**:
```typescript
    if (firstIn && lastOut && firstIn.punchedAt.getTime() <= lastOut.punchedAt.getTime()) {
      const actualDurationHours = Math.max(0, (lastOut.punchedAt.getTime() - firstIn.punchedAt.getTime()) / 3600000);
      workHours = Math.round(actualDurationHours * 10) / 10;
      if (workHours >= 7.0) {
        workUnits = 1.0;
      } else if (workHours >= 3.5) {
        workUnits = 0.5;
      }
    }
```
**Technical Explanation**: Work hours are computed strictly as total elapsed duration between `lastOut` and `firstIn`. In an 08:00–17:00 standard day, total elapsed time is 9 hours with 1 hour unpaid lunch break (standard 8 work hours). The V2 logic records 9.0 work hours.

#### 5.3 Absence of Transaction Boundaries and Advisory Locks in `recordPunch`
- **`src/modules/attendance-v2/attendance-v2.service.ts` (Lines 77–167)**:
```typescript
    let schedule = await this.repo.findSchedule(input.employeeId, workDate);
    if (!schedule) {
      if (input.shiftConfig) {
        schedule = WorkSchedule.create({ ... });
        await this.repo.saveSchedule(schedule);
      } else {
        schedule = await this.repo.ensureDefaultSchedule(input.employeeId, workDate);
      }
    }
...
    let timesheet = await this.repo.findTimesheet(input.employeeId, workDate);
...
    const punch = PunchEvent.create(punchProps);
    await this.repo.savePunch(punch);

    const punches = await this.repo.findPunches(input.employeeId, workDate);
...
    timesheet = timesheet.calculate(punches, schedule);
    await this.repo.saveTimesheet(timesheet);
```
**Technical Explanation**: `recordPunch` consists of 7 sequential asynchronous database queries executed without a database transaction (`store.transaction`) and without PostgreSQL advisory locks (`store.lock`). Concurrent punches for the same employee suffer from read-modify-write race conditions when reading existing punches and updating `timesheet_entries`.

---

### Finding 6: Employee V2 Runtime Crash & Orphaned Repository

#### 6.1 `DELETE /api/v2/employees/:username` Calls Non-Existent Method
- **`src/modules/employee-v2/employee-v2.controller.ts` (Lines 253–262)**:
```typescript
  @Delete(':username')
  async deleteEmployee(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    await this.service.delete(existing.username);
    return { deleted: true, username: existing.username };
  }
```
- **`src/modules/employee-v2/employee-v2.service.ts`**:
A search across all 495 lines of `EmployeeV2Service` reveals that `delete` does NOT exist.
*Failure mode*: Invoking `DELETE /api/v2/employees/:username` throws `TypeError: this.service.delete is not a function`, terminating in an unhandled 500 error.

#### 6.2 `EmployeeV2Repository` is Completely Orphaned
- `src/data/employee-v2.repository.ts` defines `EmployeeV2Repository`.
- `src/data/index.ts` does NOT export `EmployeeV2Repository`.
- `EmployeeV2Service` does NOT inject or use `EmployeeV2Repository`; it duplicates all queries inline using `this.store.queryBuilder`.

#### 6.3 Foreign Key Violation on Direct Deletion
- **`src/data/employee-v2.repository.ts` (Lines 398–404)**:
```typescript
  async deleteByUsername(username: string): Promise<boolean> {
    const result = await this.qb
      .deleteFrom('staff')
      .where('username', '=', username)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
```
**Technical Explanation**: `staff.uuid` is referenced as a foreign key by `timesheet_entries`, `punch_events`, `work_schedules`, and `system_requests` without `ON DELETE CASCADE` (`migrations/postgres/0001_baseline.sql:223, 255, 271, 286`). Any attempt to execute `deleteFrom('staff')` for an employee with activity will be aborted by PostgreSQL with error `23503 foreign_key_violation`.

#### 6.4 Annual Leave Model Impedance Mismatch
- **`src/platform/db.ts` (Line 236)**:
```typescript
      leaveAdjust: r.leave_total_days != null ? Number(r.leave_total_days) : r.leave_adjust || 0,
```
**Technical Explanation**:
- In Employee V2, `leave_total_days` represents the total annual leave entitlement (e.g. 12 or 22 days).
- In V1, `leaveAdjust` was a manual delta modifier (+/- days) applied to accrued leave.
- When `rowToStaff` runs, it assigns `leaveAdjust = r.leave_total_days`. Consequently, an employee with a standard 12-day annual leave entitlement is granted an extra +12 days of bonus adjusted leave in the legacy leave calculation engine (`accrued + leaveAdjust`).

---

### Finding 7: Request V2 Approval Flaws & Missing Transaction Isolation

#### 7.1 Un-Transactioned Multi-Day Leave Scheduling Loop
- **`src/modules/request-v2/request-v2.service.ts` (Lines 348–360)**:
```typescript
        } else if (req.type === 'LEAVE') {
          const start = req.leaveStartDate;
          const end = req.leaveEndDate || start;
          if (start) {
            let cur = new Date(`${start}T00:00:00.000Z`);
            const endDate = new Date(`${end}T00:00:00.000Z`);
            while (cur.getTime() <= endDate.getTime()) {
              const curStr = cur.toISOString().slice(0, 10);
              const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, curStr);
              await this.attendanceRepo.saveSchedule(sched.withLeave(req.id));
              cur = new Date(cur.getTime() + 86400000);
            }
          }
        }
```
**Technical Explanation**: `reviewRequest` executes individual queries for each day in a multi-day leave request without wrapping the loop and the final request update in a transaction (`store.transaction`). If an error or process termination occurs midway, partial schedules remain committed to `work_schedules` while the request remains in `PENDING` state.

#### 7.2 Overtime Cap Check Race Condition
- **`src/modules/request-v2/request-v2.service.ts` (Lines 223–243)**:
```typescript
    const existingOt = await this.repo.list({
      employeeId: input.employeeId,
      type: 'OVERTIME'
    });
...
    const month = otDate.slice(0, 7);
    let totalMonthOt = 0;
    for (const item of existingOt) {
      if ((item.status === 'PENDING' || item.status === 'APPROVED') && item.otDate?.startsWith(month)) {
        totalMonthOt += item.otHours || 0;
      }
    }

    if (totalMonthOt + hours > 40) {
      throw new Error(`Tổng số giờ làm thêm trong tháng ${month} không được vượt quá 40 giờ theo Luật Lao động (đã có ${totalMonthOt}h, đăng ký thêm ${hours}h)`);
    }
...
    await this.repo.save(req);
```
**Technical Explanation**: `createOvertimeRequest` reads existing OT requests, calculates the monthly sum, checks `totalMonthOt + hours > 40`, and then inserts the request. Because this is executed outside of a database transaction and without an advisory lock on the `(employeeId, month)` pair, concurrent OT requests can pass the check simultaneously and exceed the 40-hour legal limit.

#### 7.3 Lack of Optimistic Locking (`rev`) in `system_requests`
- Table `system_requests` contains no `rev` column (`migrations/postgres/0001_baseline.sql:221–251`).
- `RequestV2Repository.save` uses a blind update:
```typescript
    await this.qb
      .insertInto('system_requests')
      .values(row as any)
      .onConflict(oc =>
        oc.column('id').doUpdateSet(eb => ({ ... }))
      )
```
Concurrent approval, rejection, or cancellation requests blindly overwrite each other with last-write-wins semantics.

---

### Finding 8: UI-Bridge No-Op Stubs, Mocked Endpoints & Missing Routes

#### 8.1 No-Op Stubs Returning Faked Success
- **`src/modules/ui-bridge/ui-bridge.controller.ts` (Lines 123–137)**:
```typescript
  @Put('sheet/bulk')
  async putSheetBulk(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, needAdmin } = c;
    needAdmin();
    const body = (await readJson(req)) || {};
    return { ok: true, updated: (body.usernames || []).length };
  }

  @Put('staff/shift-bulk')
  async putStaffShiftBulk(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, needAdmin } = c;
    needAdmin();
    const body = (await readJson(req)) || {};
    return { ok: true, shiftCode: body.preset || 'normal', updated: body.usernames || [] };
  }
```
**Technical Explanation**: Both endpoints return `{ ok: true }` without updating any database table. When administrators execute bulk shift assignments or bulk timesheet edits via the web UI, the UI displays a success notification while the database remains unchanged.

#### 8.2 Hardcoded Mock Attendance Status in `GET /api/today`
- **`src/modules/ui-bridge/ui-bridge.controller.ts` (Lines 191–206)**:
```typescript
  @Get('today')
  async getToday(@Ctx() c: ApiContext): Promise<unknown> {
    const { needAdmin } = c;
    needAdmin();
    const today = this.rules.vnToday();
    const people = (await this.store.listStaff()).filter((s: any) => s.payrollSubject);
    const rows = people.map((s: any) => ({
      username: s.username,
      name: s.name,
      status: 'checked-out',
      shift: s.shiftCode || 'normal',
      in: null,
      out: null
    }));
    return { today, rows };
  }
```
**Technical Explanation**: `GET /api/today` does not read from `punch_events` or `timesheet_entries`. Every employee is returned as `status: 'checked-out'`, `in: null`, `out: null`. Real-time attendance on the admin dashboard is completely non-functional.

#### 8.3 Missing Routes Generating 404s for Admin Actions
1. **`PUT /api/ot`**:
   - `web/src/services/admin-attendance.ts` line 116 invokes `api('PUT', '/ot', ...)`.
   - `UiBridgeController` only implements `@Get('ot')` (lines 208–213). `@Put('ot')` does not exist on any controller.
2. **`POST /api/explanations/:id/decide` & `/answer`**:
   - `web/src/services/admin-explanations.ts` line 3 invokes `POST /explanations/:id/decide`.
   - `UiBridgeController` only implements `@Get('explanations')` and `@Post('explanations')`. The route `/explanations/:id/decide` does not exist.

---

## 2. Logic Chain

1. **Premise 1 (Schema Drop vs Legacy Retention)**:
   The database migration `0001_baseline.sql` established 21 PostgreSQL tables, intentionally omitting 12 legacy tables. To keep legacy code compilable, `LegacySchema` was created with `any` types.
2. **Premise 2 (Swallowed Read Errors)**:
   Because legacy repositories (`attendance.repository.ts`, `records.repository.ts`, `catalog.repository.ts`, `advance-approvals.repository.ts`) were not rewritten to target the new tables, their read methods were wrapped in `try/catch` blocks returning empty arrays/objects when table lookup fails.
3. **Deduction 1 (Data Starvation in V1 Calculation)**:
   The official payroll engine (`periods.calculate` -> `payroll-preview.ts:loadInputs`) relies exclusively on these legacy store calls (`store.getSheet`, `store.listSessions`, `store.approvals.forSheet`). Because these calls swallow the missing table errors and return empty structures, the calculation engine runs on zeroed data.
4. **Deduction 2 (V2 Isolation)**:
   While V2 aggregates (`AttendanceV2`, `PayrollV2`, `RequestV2`) write to and read from the new tables, `PayrollV2Service` does not persist payslips to `payroll_runs` or `payslips`. Furthermore, the web frontend has zero references to `/api/v2/*`.
5. **Deduction 3 (Broken UI-Bridge Compatibility)**:
   The UI-Bridge was created to intercept legacy `/api/*` endpoints and translate them to V2, but was implemented with no-op stubs (`PUT /sheet/bulk`, `PUT /staff/shift-bulk`), mock returns (`GET /today`), missing routes (`PUT /ot`, `POST /explanations/:id/decide`), and uncaught crashes (`DELETE /api/v2/employees/:username`).
6. **Final Conclusion**:
   The backend currently consists of two disconnected architectures: an active V1 engine operating on empty/corrupted data from non-existent tables, and an isolated V2 engine with zero persistence, hardcoded calculations, and no client-facing connections.

---

## 3. Caveats

- **Scope boundary**: This audit was strictly read-only and code-level. No database writes or runtime modifications were executed.
- **Frontend analysis**: Audited `web/src/services/` to verify API endpoint contracts and HTTP method parity; did not audit CSS/rendering components.
- **Assumptions**: Preserved all existing business policies and integrity demo mode constraints.

---

## 4. Conclusion

The system exhibits severe transition debt and architectural fragmentation:
1. **Critical Path Failure**: The official monthly payroll lifecycle (`POST /api/periods/:month/calculate`) writes payslips with 0 worked hours and 0 days worked because its input pipeline queries dropped legacy tables and catches the errors silently.
2. **V2 Aggregates Disconnected**: `PayrollV2Service` has zero database persistence (in-memory only) and is not called by the frontend.
3. **Hardcoding & Regulatory Non-Compliance**: `PayrollV2` hardcodes standard workdays (26), overtime rates (100% at 200%), shift allowances (20% flex, 40% night), and late deduction constants (-16,827 VND), and deducts 10.5% insurance without verifying insurance eligibility.
4. **Runtime Crash**: `EmployeeV2Controller` crashes on `DELETE /api/v2/employees/:username` due to calling a non-existent method `this.service.delete()`.
5. **UI-Bridge Gaps**: Key UI routes (`PUT /ot`, `POST /explanations/:id/decide`) are missing, while bulk update endpoints are dead no-op stubs.

---

## 5. Verification Method

### 5.1 Verification Commands
From repo root (`C:\Users\52.AI UD\Project\Vladilena-Milize`):
```powershell
# 1. Typecheck verification
npm run typecheck

# 2. Database schema vs model inspection
npm run db:types
```

### 5.2 Code Inspection Checkpoints
- Inspect `src/data/legacy-schema.ts` lines 7–20 against `migrations/postgres/0001_baseline.sql` lines 1–334 to verify that the 12 tables in `LegacySchema` do not exist in PostgreSQL.
- Inspect `src/params/payroll-preview.ts` lines 141–168 to confirm `loadInputs` calls `store.getSheet()` and `store.listSessions()`.
- Inspect `src/platform/db.ts` lines 1271–1291 to confirm `getSheet()` catches table-not-found errors and returns empty days.
- Inspect `src/domain/payroll-v2/payroll-v2-service.ts` lines 7–35 to confirm `generatePeriodPayslips()` returns ephemeral summaries and never invokes repository insert methods.
- Inspect `src/modules/employee-v2/employee-v2.controller.ts` line 260 against `src/modules/employee-v2/employee-v2.service.ts` to confirm `this.service.delete` is undefined.
- Inspect `src/modules/ui-bridge/ui-bridge.controller.ts` lines 123–137 to confirm `putSheetBulk` and `putStaffShiftBulk` are no-op stubs.

### 5.3 Invalidation Conditions
This report is invalidated if:
- Physical PostgreSQL tables for `timesheets`, `attendance_sessions`, `sheet_approvals`, etc., are restored in `0001_baseline.sql`.
- `periods.calculate` is refactored to read from `timesheet_entries` and `punch_events`.
- `PayrollV2Service` is wired to persist runs into `payroll_runs` and `payslips`.
