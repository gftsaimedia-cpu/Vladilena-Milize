// Dịch vụ Bảng lương: bảng lương cả kỳ, phiếu lương từng người, sửa điểm KPI, duyệt / từ chối phiếu.
// Máy chủ thật: GET /api/v2/payroll/:month và /:month/:username; lưu KPI qua PUT /:month/kpi/:username rồi tính lại
// phiếu người đó (POST /:month/calculate); duyệt / từ chối qua POST /:month/:username/decision. Dữ liệu giả: mock/payroll.ts.
import { payrollScreenFromPayslips, payslipFromRecord } from '@/builders/api/payroll';
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
import { useSessionStore } from '@/stores/session';
import { notConnected } from './data-mode';
import { ApiError, api } from './http';

const enc = encodeURIComponent;

// Hôm nay theo giờ Việt Nam (UTC+7) của đồng hồ máy chủ.
function today(): string {
  const now = useSessionStore().serverNow;
  return new Date((now ? Date.parse(now) : Date.now()) + 7 * 3600000).toISOString().slice(0, 10);
}

export async function getPayroll(month: string): Promise<PayrollScreen> {
  if (__MOCK__) return respond(payrollView(month));
  const { items = [] } = await api.get(`/payroll/${enc(month)}`);
  return payrollScreenFromPayslips(items, month);
}

export async function getPayslip(month: string, id: string): Promise<Payslip | null> {
  if (__MOCK__) return respond(payslipView(month, id));
  try {
    const { payslip } = await api.get(`/payroll/${enc(month)}/${enc(id)}`);
    return payslipFromRecord(payslip, today());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// Lưu một phần KPI (điểm 0–100, null = xoá), tính lại phiếu của người đó để số tiền theo điểm mới, rồi đọc lại phiếu.
export async function saveKpiScore(month: string, id: string, part: KpiPart, value: number | null): Promise<Payslip | null> {
  if (__MOCK__) return respond(setKpiScore(month, id, part, value));
  await api.put(`/payroll/${enc(month)}/kpi/${enc(id)}`, { [part]: value });
  await api.post(`/payroll/${enc(month)}/calculate`, { employeeIds: [id] });
  return getPayslip(month, id);
}

/** Tính lương cả kỳ (lần chạy nháp mới cho mọi người): POST /api/v2/payroll/:month/calculate. Trả { runId, calculated, errors }. */
export const calculatePayroll = (month: string) =>
  __MOCK__ ? notConnected() : api.post(`/payroll/${enc(month)}/calculate`, {});

// Duyệt / từ chối phiếu của một người rồi đọc lại phiếu.
export async function decidePayslip(month: string, id: string, decision: 'approve' | 'reject'): Promise<Payslip | null> {
  if (__MOCK__) return respond(decideMock(month, id, decision));
  await api.post(`/payroll/${enc(month)}/${enc(id)}/decision`, { decision });
  return getPayslip(month, id);
}

// Tính lại phiếu theo điểm đang gõ mà chưa ghi: đồng bộ, trên bản sao, để phiếu đổi số ngay khi gõ.
// Máy chủ thật: không tính bằng công thức của mockup (có thể lệch luật của BE); chỉ hiện điểm mới, số tiền đổi khi lưu.
export function previewPayslip(slip: Payslip, scores: KpiScores): Payslip {
  const clean = Object.fromEntries(Object.entries(scores).map(([p, v]) => [p, normalizeScore(v)])) as KpiScores;
  if (!__MOCK__) return { ...slip, kpi: { ...slip.kpi, scores: clean } };
  return recomputeSlip({ ...slip, kpi: { ...slip.kpi, scores: clean } });
}
