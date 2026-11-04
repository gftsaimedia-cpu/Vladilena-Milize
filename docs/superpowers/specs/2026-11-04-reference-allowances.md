# Reference allowance behavior

This bounded change aligns the active payroll calculation with the approved allowance behavior from `C:\Users\52.AI UD\Downloads\luong-nhan-su-webapp\luong-app\public\index.html` while preserving the Nest payroll API, payslip DTOs, snapshots, and all non-allowance calculations.

## Approved behavior

- FLEX: TTS/CTV 10%; NV 20%; amount is rate × hourly base × paid hours (maximum 8 hours).
- NIGHT: TTS/CTV 30%; NV uses the employee's saved `shift_allowance_pct` (40% or 60%, default 40%). Amount is rate × daily base.
- NIGHT break: at 8+ worked hours, add one hourly base multiplied by (1 + night rate); below 8 hours the break fills the shortage, so it is not separately paid. Because the current payroll path already deducts late/early minutes, represent that fill as a capped allowance credit against the existing deduction, without changing the deduction formula or other base-pay behavior.
- Attendance/travel allowances apply only to NV. Travel is 15% of base salary × allowance-eligible work days / standard work days, except iDorm residents get zero. Attendance is 25% by the same ratio only when `max(0, paid leave days + unpaid days - completed makeup days) <= 4`. A completed makeup day is a unique work date with persisted `work_schedules.schedule_type = MAKE_UP` and a matching PRESENT timesheet with positive work hours. Makeup dates do not earn monthly travel/attendance allowance or daily Flex/Night premiums; they remain part of existing base work-day/pay totals.
- Keep the existing 26-day payroll denominator, base salary, OT, KPI, tax, insurance, advances, review lifecycle, and historical payslip snapshots unchanged.

## Source-of-truth fields

- Employee type is `staff.type` (`tts`, `ctv`, `nv`).
- Individual Night rate is persisted as `staff.shift_allowance_pct`, exposed by `EmployeeContract.shift.allowancePct`.
- iDorm flag is `staff.idorm`, exposed by `EmployeeContract.isDormResident`.
- Monthly paid leave comes from approved LEAVE requests. Completed makeup dates come from the persisted work-schedule marker joined to attendance by employee and work date, independent of which month the originating request was filed. Approved requests alone do not count as completed makeup.

## Acceptance examples

- FLEX 4 paid hours at hourly base 1,000: TTS/CTV allowance 40; NV allowance 80.
- NV Night 40%/60% at daily base 8,000: premium 3,200/4,800.
- Night hourly base 1,000 and 8 worked hours: break allowance 1,400 at 40%, 1,600 at 60%; below 8 hours, no standalone break payment.
- NV with 20/26 worked days and base 6,000,000: travel 692,308 (unless iDorm); attendance 1,153,846 when eligible; no attendance allowance above four net absence days.
- TTS/CTV receive none of the NV-only travel/attendance allowances.
