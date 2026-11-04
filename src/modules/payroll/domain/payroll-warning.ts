export type PayrollWarningCode =
  | 'KPI_PROPOSAL_MISSING'
  | 'KPI_SCORE_MISSING'
  | 'KPI_PROPOSAL_EXCEEDS_MAX';

export interface PayrollWarning {
  code: PayrollWarningCode;
  message: string;
  fields?: string[];
}

export const WARNING_MESSAGES: Record<PayrollWarningCode, string> = {
  KPI_PROPOSAL_MISSING: 'Chưa nhập lương KPI đề xuất của tháng; lương KPI tạm tính 0.',
  KPI_SCORE_MISSING: 'Thiếu điểm KPI; cột thiếu tính 0 điểm.',
  KPI_PROPOSAL_EXCEEDS_MAX: 'Lương KPI đề xuất vượt mức KPI của bậc; đã tính theo mức của bậc.'
};

export function warning(code: PayrollWarningCode, fields?: string[]): PayrollWarning {
  const w: PayrollWarning = { code, message: WARNING_MESSAGES[code] };
  if (fields) w.fields = fields;
  return w;
}
