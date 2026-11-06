// Dịch vụ Bảng lương: bảng lương cả kỳ, phiếu lương từng người, sửa điểm KPI, duyệt / từ chối phiếu.
// Máy chủ thật: GET /api/v2/payroll/:month và /:month/:username; lưu KPI qua PUT /:month/kpi/:username rồi tính lại
// phiếu người đó (POST /:month/calculate); duyệt / từ chối qua POST /:month/:username/decision. Dữ liệu giả: mock/payroll.ts.
import { payrollScreenFromPayslips, payslipFromRecord } from '@/builders/api/payroll';
import {
  decidePayslip as decideMock,
  payrollView,
  payslipView,
  previewSlip,
  setKpiScore,
  type Payslip,
  type PayrollScreen
} from '@/mock/payroll';
import type { KpiPart, KpiScores } from '@/mock/payroll-calc';
import { respond } from '@/mock/respond';
import { ApiError, api } from './http';

const enc = encodeURIComponent;

export async function getPayroll(month: string): Promise<PayrollScreen> {
  if (__MOCK__) return respond(payrollView(month));
  const { items = [], totals } = await api.get(`/payroll/${enc(month)}`);
  return payrollScreenFromPayslips(items, month, totals);
}

export async function getPayslip(month: string, id: string): Promise<Payslip | null> {
  if (__MOCK__) return respond(payslipView(month, id));
  try {
    const { payslip } = await api.get(`/payroll/${enc(month)}/${enc(id)}`);
    return payslipFromRecord(payslip);
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
// employeeIds: tính lại riêng các phiếu này (chế độ "Tính lại lương" của bảng); không có thì tính cả kỳ.
export function calculatePayroll(month: string, employeeIds?: string[]) {
  const body = employeeIds?.length ? { employeeIds } : {};
  if (!__MOCK__) return api.post(`/payroll/${enc(month)}/calculate`, body);
  const view = payrollView(month);
  const count = employeeIds?.length ? employeeIds.length : view.empty ? 0 : view.lines.length;
  return respond({ count, errors: [] as { employeeId: string; message?: string }[] });
}

// Duyệt / từ chối phiếu của một người rồi đọc lại phiếu. Lý do từ chối (không bắt buộc) chỉ gửi khi có chữ.
export async function decidePayslip(
  month: string,
  id: string,
  decision: 'approve' | 'reject',
  note?: string
): Promise<Payslip | null> {
  if (__MOCK__) return respond(decideMock(month, id, decision, note));
  const text = note?.trim();
  await api.post(`/payroll/${enc(month)}/${enc(id)}/decision`, text ? { decision, note: text } : { decision });
  return getPayslip(month, id);
}

// Phiếu theo điểm đang gõ mà chưa ghi, đồng bộ, trên bản sao. Máy chủ thật: không tính gì ở FE, chỉ hiện điểm đang gõ
// (số tiền do BE tính và đổi khi lưu); dữ liệu giả: máy tính giả trong mock/payroll.ts.
export function previewPayslip(slip: Payslip, scores: KpiScores): Payslip {
  if (!__MOCK__) return { ...slip, kpi: { ...slip.kpi, scores } };
  return previewSlip(slip, scores);
}
