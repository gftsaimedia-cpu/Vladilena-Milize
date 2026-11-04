import { PayrollWarning, warning } from './payroll-warning';

export type KpiComponent = 'wework' | 'user' | 'peer' | 'manager' | 'self';

const KPI_COMPONENTS: KpiComponent[] = ['wework', 'user', 'peer', 'manager', 'self'];

export const KPI_WEIGHTS: Record<KpiComponent, number> = { wework: 40, user: 24, peer: 18, manager: 12, self: 6 };

// Scores are stored as points x 100 (0..10000); the weights sum to 100, so units are in 1/1_000_000 of the proposal.
export interface KpiInput {
  scores: Partial<Record<KpiComponent, number | null>>;
  proposedAmount: number | null;
}

export interface KpiCap {
  applicable: boolean;
  kpiMax: number | null;
}

export interface KpiPay {
  applicable: boolean;
  scores: Record<KpiComponent, number | null>;
  weightedPct: number;
  proposedAmount: number | null;
  appliedAmount: number;
  amount: number;
  warnings: PayrollWarning[];
}

export function calculateKpiPay(input: KpiInput | null, cap: KpiCap): KpiPay {
  const scores = {} as Record<KpiComponent, number | null>;
  let units = 0;
  for (const component of KPI_COMPONENTS) {
    const value = input?.scores[component] ?? null;
    scores[component] = value === null ? null : value / 100;
    units += (value ?? 0) * KPI_WEIGHTS[component];
  }
  const weightedPct = Math.round(units / 100) / 100;
  const proposedAmount = input?.proposedAmount ?? null;

  if (!cap.applicable) {
    return { applicable: false, scores, weightedPct, proposedAmount, appliedAmount: 0, amount: 0, warnings: [] };
  }

  const appliedAmount = Math.min(proposedAmount ?? 0, cap.kpiMax ?? 0);
  const amount = Math.round((appliedAmount * units) / 1_000_000);

  const warnings: PayrollWarning[] = [];
  if (proposedAmount === null) warnings.push(warning('KPI_PROPOSAL_MISSING'));
  if (proposedAmount !== null && cap.kpiMax !== null && proposedAmount > cap.kpiMax) {
    warnings.push(warning('KPI_PROPOSAL_EXCEEDS_MAX'));
  }
  const missing = KPI_COMPONENTS.filter(component => scores[component] === null);
  if (missing.length > 0) warnings.push(warning('KPI_SCORE_MISSING', missing));

  return { applicable: true, scores, weightedPct, proposedAmount, appliedAmount, amount, warnings };
}
