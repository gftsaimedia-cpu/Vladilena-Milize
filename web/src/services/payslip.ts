// Dịch vụ của trang in phiếu lương A4 (/in/phieu-luong/:month[/:id]).
// Máy chủ thật: một phiếu GET /api/v2/payroll/:month/:id, in tất cả GET /api/v2/payroll/:month (giữ phiếu đã duyệt);
// bản in dựng bằng builders/api/payslip-a4.ts. Dữ liệu giả: tháng mẫu của mock/payslip-a4.ts.
import { approvedSheetsFromRecords, sheetFromRecord } from '@/builders/api/payslip-a4';
import { approvedSheets, personSheet, type A4Sheet } from '@/mock/payslip-a4';
import { respond } from '@/mock/respond';
import { ApiError, api } from './http';

const enc = encodeURIComponent;

// Dữ liệu giả không có thì báo như api() ở chế độ giả (mock_missing), để trang in hiện dòng không tải được.
const mockMissing = (path: string) =>
  new ApiError(501, `Màn này chưa có dữ liệu giả (GET ${path}).`, { code: 'mock_missing' });

/** Bản in A4 (2 trang) của phiếu một người. Chưa có phiếu: BE trả 404, trang in hiện dòng không tải được. */
export async function getPayslipSheet(month = '', id = ''): Promise<A4Sheet> {
  if (__MOCK__) {
    const sheet = personSheet(month, id);
    if (!sheet) throw mockMissing(`/payroll/${month}/${id}`);
    return respond(sheet);
  }
  const { payslip } = await api.get(`/payroll/${enc(month)}/${enc(id)}`);
  return sheetFromRecord(payslip);
}

/** Bản in A4 của mọi phiếu đã duyệt trong kỳ (In tất cả), xếp theo tên như Bảng lương. Kỳ chưa tính: danh sách rỗng. */
export async function getApprovedSheets(month = ''): Promise<A4Sheet[]> {
  if (__MOCK__) {
    const sheets = approvedSheets(month);
    if (!sheets) throw mockMissing(`/payroll/${month}`);
    return respond(sheets);
  }
  const { items = [] } = await api.get(`/payroll/${enc(month)}`);
  return approvedSheetsFromRecords(items);
}
