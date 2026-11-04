// File CSV của bảng lương: UTF-8 có BOM để Excel đọc đúng tiếng Việt, phân cách ';', dòng kết thúc '\r\n'.
import type { PayrollLine, PayrollStatus } from '@/mock/payroll';

export const STATUS_LABEL: Record<PayrollStatus, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  done: 'Đã duyệt',
  rejected: 'Từ chối'
};

const HEAD = [
  'Mã',
  'Họ tên',
  'Phòng ban',
  'Chức danh',
  'Ngày công',
  'Tiền ngày công',
  'Lương KPI',
  'Phụ cấp',
  'Làm thêm',
  'Trừ giờ',
  'Tổng thu nhập',
  'Bảo hiểm',
  'Thuế TNCN',
  'Tạm ứng',
  'Thực nhận',
  'Trạng thái'
];

// Ô có ';', '"' hoặc xuống dòng thì bọc ngoặc kép, dấu '"' trong ô nhân đôi.
const cell = (v: string | number) => {
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function payrollCsv(lines: PayrollLine[]): string {
  const rows = lines.map(l => [
    l.id,
    l.name,
    l.dept,
    l.title,
    l.days,
    l.workPay,
    l.kpiPay,
    l.allowance,
    l.ot,
    l.lateCut ? -l.lateCut : 0,
    l.gross,
    l.insurance,
    l.tax,
    l.advance,
    l.net,
    STATUS_LABEL[l.status]
  ]);
  return '\uFEFF' + [HEAD, ...rows].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
