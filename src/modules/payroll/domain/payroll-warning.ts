export type KpiWarningCode = 'KPI_PROPOSAL_MISSING' | 'KPI_SCORE_MISSING' | 'KPI_PROPOSAL_EXCEEDS_MAX';

/** A day whose pay-affecting case is not approved yet (spec 8.1): explanation pending, never filed, or rejected. */
export type ExplanationWarningCode = 'EXPLANATION_PENDING' | 'EXPLANATION_MISSING' | 'EXPLANATION_REJECTED';

export type PayrollWarningCode = KpiWarningCode | ExplanationWarningCode;

export interface PayrollWarning {
  code: PayrollWarningCode;
  message: string;
  fields?: string[];
}

export const WARNING_MESSAGES: Record<KpiWarningCode, string> = {
  KPI_PROPOSAL_MISSING: 'Chưa nhập lương KPI đề xuất của tháng; lương KPI tạm tính 0.',
  KPI_SCORE_MISSING: 'Thiếu điểm KPI; cột thiếu tính 0 điểm.',
  KPI_PROPOSAL_EXCEEDS_MAX: 'Lương KPI đề xuất vượt mức KPI của bậc; đã tính theo mức của bậc.'
};

export function warning(code: KpiWarningCode, fields?: string[]): PayrollWarning {
  const w: PayrollWarning = { code, message: WARNING_MESSAGES[code] };
  if (fields) w.fields = fields;
  return w;
}

const EXPLANATION_TEXT: Record<ExplanationWarningCode, string> = {
  EXPLANATION_PENDING: 'chờ giải trình',
  EXPLANATION_MISSING: 'chưa giải trình',
  EXPLANATION_REJECTED: 'giải trình bị từ chối'
};

/** The warning of one day (P9): "03/11 chờ giải trình"; `fields` holds the date 'YYYY-MM-DD'. */
export function explanationWarning(code: ExplanationWarningCode, date: string): PayrollWarning {
  const [, month, day] = date.split('-');
  return { code, message: `${day}/${month} ${EXPLANATION_TEXT[code]}`, fields: [date] };
}
