export class PayrollAllowancePolicy {
  readonly isKnownType: boolean;
  readonly isNv: boolean;
  readonly flexRate: number;
  readonly nightRate: number;

  constructor(employeeType?: string, nightAllowancePct?: number) {
    this.isNv = employeeType === 'nv';
    const isTtsOrCtv = employeeType === 'tts' || employeeType === 'ctv';
    this.isKnownType = this.isNv || isTtsOrCtv;
    this.flexRate = this.isNv ? 0.2 : isTtsOrCtv ? 0.1 : 0;
    this.nightRate = this.isNv ? (nightAllowancePct === 60 ? 0.6 : 0.4) : isTtsOrCtv ? 0.3 : 0;
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
