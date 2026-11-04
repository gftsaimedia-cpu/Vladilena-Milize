// Xuất danh sách nhân sự ra CSV cho Excel: UTF-8 có BOM, phân cách ";", dòng kết thúc "\r\n".
import type { StaffRow } from '@/mock/staff';
import { dmy } from '@/utils/format';

const HEADER = ['Mã', 'Họ tên', 'Email', 'Phòng ban', 'Chức danh', 'Trạng thái', 'Ngày vào làm', 'Tài khoản'];

/** Ô có `;`, `"` hoặc xuống dòng thì bọc ngoặc kép; `"` bên trong nhân đôi. */
export function csvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function staffCsv(rows: StaffRow[]): string {
  const line = (cells: string[]) => cells.map(csvCell).join(';') + '\r\n';
  const body = rows.map(r =>
    line([
      r.code,
      r.name,
      r.email,
      r.dept,
      r.title,
      r.statusLabel,
      dmy(r.joined),
      r.activated ? 'Đã kích hoạt' : 'Chưa kích hoạt'
    ])
  );
  return '\ufeff' + line(HEADER) + body.join('');
}

/** Tải `danh-sach-nhan-su.csv` bằng Blob và thẻ <a download>. */
export function downloadStaffCsv(rows: StaffRow[]): void {
  const url = URL.createObjectURL(new Blob([staffCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'danh-sach-nhan-su.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
