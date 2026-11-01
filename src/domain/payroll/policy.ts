'use strict';
// Loại hợp đồng tính thuế và bảo hiểm:
//   - Suy từ thâm niên (tax.contract.basis = 'tenure'): thâm niên đủ tax.longTermMonths tháng tròn (tính từ ngày vào làm tới hết
//     tháng lương) thì thuế lũy tiến có giảm trừ gia cảnh và đóng bảo hiểm ('long'); chưa đủ thì khấu trừ 10% từ 5 triệu ('short').
//     Người chưa có ngày vào làm giữ mặc định theo chức vụ.
// Khoá tham số tax.contract.basis, tax.longTermMonths và shift.allowance.basis nằm trong bộ tham số của tháng như mọi tham số khác.

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS_PER_YEAR = 12; // đơn vị lịch
const pad = (n?) => String(n).padStart(2, '0');
const daysIn = (y?, m?) => new Date(Date.UTC(y, m, 0)).getUTCDate();

class PayrollPolicy {
  // 'long' nếu tới hết tháng `month` người vào làm ngày `startDate` đã đủ `months` tháng tròn, 'short' nếu chưa; thiếu ngày thì null.
  // Tháng tròn tính như phép năm (src/engine/leave.ts): cùng ngày của tháng sau, tháng ngắn hơn thì lùi về ngày cuối tháng.
  static tenureContract(startDate?, month?, months?) {
    if (!DATE_RE.test(String(startDate)) || !MONTH_RE.test(String(month)) || !Number.isInteger(months) || months < 0)
      return null;
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const index = sm - 1 + months;
    const dueYear = sy + Math.floor(index / MONTHS_PER_YEAR),
      dueMonth = (index % MONTHS_PER_YEAR) + 1;
    const due = `${dueYear}-${pad(dueMonth)}-${pad(Math.min(sd, daysIn(dueYear, dueMonth)))}`;
    const [y, m] = month.split('-').map(Number);
    return due <= `${month}-${pad(daysIn(y, m))}` ? 'long' : 'short';
  }

  // Hợp đồng dùng để tính thuế và bảo hiểm của một người ở tháng theo bộ tham số P: theo thâm niên khi tax.contract.basis = 'tenure', còn lại giữ fallback
  static contractFor(P?, startDate?, month?, fallback?) {
    if (P['tax.contract.basis'] !== 'tenure') return fallback;
    return PayrollPolicy.tenureContract(startDate, month, P['tax.longTermMonths']) || fallback;
  }
}

export = { PayrollPolicy };
