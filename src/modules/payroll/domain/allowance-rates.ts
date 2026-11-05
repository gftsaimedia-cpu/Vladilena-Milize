// The % of the position version in force for the month (position_types, with position_levels.night_pct).
export interface AllowanceRates {
  flexPct: number;
  typeNightPct: number;
  levelNightPct: number | null; // null = the level keeps the type's night rate
  travelPct: number;
  attendancePct: number;
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

  flexPremium(hourlyBase: number, workedHours: number): number {
    return Math.round(this.flexRate * hourlyBase * Math.min(8, Math.max(0, workedHours)));
  }

  nightPremium(dailyBase: number): number {
    return Math.round(this.nightRate * dailyBase);
  }

  nightBreakPay(hourlyBase: number, workedHours: number, timeDeduction: number): number {
    if (!this.isKnownType) return 0;
    if (workedHours >= 8) return Math.round(hourlyBase * (1 + this.nightRate));
    const filledShortage = Math.round(hourlyBase * Math.min(1, Math.max(0, 8 - workedHours)));
    return Math.min(filledShortage, Math.max(0, timeDeduction));
  }
}
