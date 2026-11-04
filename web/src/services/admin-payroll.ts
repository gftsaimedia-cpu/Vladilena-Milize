// Dịch vụ Bảng lương trên dữ liệu giả (mock/payroll.ts): bảng lương cả kỳ, phiếu lương từng người, sửa điểm KPI,
// duyệt / từ chối phiếu. Không gọi máy chủ; respond() trả bản sao như một lời gọi thật.
import {
  decidePayslip as decideMock,
  payrollView,
  payslipView,
  setKpiScore,
  type Payslip,
  type PayrollScreen
} from '@/mock/payroll';
import { normalizeScore, recomputeSlip, type KpiPart, type KpiScores } from '@/mock/payroll-calc';
import { respond } from '@/mock/respond';

export const getPayroll = (month: string): Promise<PayrollScreen> => respond(payrollView(month));

export const getPayslip = (month: string, id: string): Promise<Payslip | null> => respond(payslipView(month, id));

export const saveKpiScore = (month: string, id: string, part: KpiPart, value: number | null): Promise<Payslip | null> =>
  respond(setKpiScore(month, id, part, value));

export const decidePayslip = (month: string, id: string, decision: 'approve' | 'reject'): Promise<Payslip | null> =>
  respond(decideMock(month, id, decision));

// Tính lại phiếu theo điểm đang gõ mà chưa ghi: đồng bộ, trên bản sao, để phiếu đổi số ngay khi gõ.
export function previewPayslip(slip: Payslip, scores: KpiScores): Payslip {
  const clean = Object.fromEntries(Object.entries(scores).map(([p, v]) => [p, normalizeScore(v)])) as KpiScores;
  return recomputeSlip({ ...slip, kpi: { ...slip.kpi, scores: clean } });
}
