// The month already has a final run; it can no longer be recalculated.
export class PayrollFinalizedError extends Error {
  readonly code = 'PAYROLL_FINALIZED';

  constructor(message = 'Kỳ lương đã chốt, không thể tính lại') {
    super(message);
    this.name = 'PayrollFinalizedError';
  }
}

export class KpiValidationError extends Error {
  constructor(
    readonly code: 'INVALID_KPI_SCORE' | 'KPI_PROPOSAL_EXCEEDS_MAX' | 'KPI_NOT_APPLICABLE' | 'EMPLOYEE_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'KpiValidationError';
  }
}
