'use strict';
// Tổng phụ cấp của phiếu cho src/domain/period/periods.ts.
const numOr0 = (value?) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

// Tổng phụ cấp = thành phần ③ của khung lương (service.thanhPhanOf): phụ cấp ca + giờ nghỉ đêm + đi lại + chuyên cần + MỌI khối phụ cấp C&B thêm.
// Mỗi thành phần là số nguyên đồng (bản chụp cũ có số thực thì làm tròn từng thành phần), tổng = cộng đúng các dòng phụ cấp hiện trên phiếu.
// Là SỐ TỰ TÍNH của bản chụp (số Admin sửa trên phiếu KHÔNG được áp vào). null khi bản chụp thiếu một dòng của tổng (phiếu nhân sự có ô sửa đã bị bỏ dòng, phiếu lỗi).
const ALLOWANCE_TRACE_KEYS = ['phuCapCa', 'gioNghiDem', 'phuCapDiLai', 'phuCapChuyenCan'];
function allowanceTotalOf(snapshot?) {
  const trace = snapshot && snapshot.trace;
  if (!trace || ALLOWANCE_TRACE_KEYS.some(key => !Object.hasOwn(trace, key))) return null;
  return (
    ALLOWANCE_TRACE_KEYS.reduce((sum, key) => sum + Math.round(numOr0(trace[key])), 0) +
    (snapshot.blocks || []).reduce((sum, b) => sum + Math.round(numOr0(b.amount)), 0)
  );
}

export = { allowanceTotalOf };
