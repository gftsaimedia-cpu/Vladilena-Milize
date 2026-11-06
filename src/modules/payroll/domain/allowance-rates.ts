// The % of the position version in force for the month (position_types, with position_levels.night_pct).
export interface AllowanceRates {
  flexPct: number;
  typeNightPct: number;
  levelNightPct: number | null; // null = the level keeps the type's night rate
  travelPct: number;
  attendancePct: number;
}

/**
 * The hours of a day line that belong to its shift: the hours worked minus the makeup minutes (D13). Makeup windows lie
 * outside the shift hours but `workHours` counts them; they pay the hourly rate x1 and earn no Flex premium, no night
 * break pay and no night tax exemption.
 */
export function shiftHoursOf(workedHours: number, makeupMinutes: number): number {
  return Math.max(0, workedHours - makeupMinutes / 60);
}

export class PayrollAllowancePolicy {
  readonly isKnownType: boolean;
  readonly isNv: boolean;
  readonly flexRate: number;
  readonly nightRate: number;
  readonly travelRate: number;
  readonly attendanceRate: number;

  // rates null = the staff has no position version for the month: no allowance at all.
  constructor(employeeType: string | undefined, nightAllowancePct: number | undefined, rates: AllowanceRates | null | undefined) {
    this.isNv = employeeType === 'nv';
    this.isKnownType = rates != null;
    if (rates == null) {
      this.flexRate = 0;
      this.nightRate = 0;
      this.travelRate = 0;
      this.attendanceRate = 0;
      return;
    }
    this.flexRate = rates.flexPct / 100;
    // An NV picks 40% or 60% per person; other types take the level's rate, else the type's.
    this.nightRate = this.isNv
      ? nightAllowancePct === 60
        ? 0.6
        : 0.4
      : (rates.levelNightPct ?? rates.typeNightPct) / 100;
    this.travelRate = rates.travelPct / 100;
    this.attendanceRate = rates.attendancePct / 100;
  }

  /** Hours of one day that earn the flex premium: the hours worked, capped at eight. */
  flexHours(workedHours: number): number {
    return Math.min(8, Math.max(0, workedHours));
  }

  /** The flex premium of one day line, rounded on its own: display only (the payslip item is one formula, D1). */
  flexPremium(hourlyBase: number, workedHours: number): number {
    return Math.round(this.flexRate * hourlyBase * this.flexHours(workedHours));
  }

  /** The night premium of one day line, rounded on its own: display only (the payslip item is one formula, D1). */
  nightPremium(dailyBase: number): number {
    return Math.round(this.nightRate * dailyBase);
  }

  /**
   * The night break pay of one day in hours of pay, exact: a full shift (8h or more) pays one hour at 1 + the night
   * rate; a short one fills the shortage, at most one hour and at most the hours deducted that day.
   */
  nightBreakHours(workedHours: number, deductedHours: number): number {
    if (!this.isKnownType) return 0;
    if (workedHours >= 8) return 1 + this.nightRate;
    return Math.min(1, Math.max(0, 8 - workedHours), Math.max(0, deductedHours));
  }

  /** The night break pay of one day line, rounded on its own and capped by the line's shown deduction: display only. */
  nightBreakPay(hourlyBase: number, workedHours: number, timeDeduction: number): number {
    if (!this.isKnownType) return 0;
    if (workedHours >= 8) return Math.round(hourlyBase * (1 + this.nightRate));
    const filledShortage = Math.round(hourlyBase * Math.min(1, Math.max(0, 8 - workedHours)));
    return Math.min(filledShortage, Math.max(0, timeDeduction));
  }
}
