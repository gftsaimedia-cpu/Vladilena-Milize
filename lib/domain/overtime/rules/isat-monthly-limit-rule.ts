'use strict';
const { Rule, Violation } = require('../../shared/rule');

const countIsat = (days?) => Object.values<any>(days).filter(x => x.kind === 'isat').length;

// Giới hạn số ngày iSAT một tháng (isat.monthlyLimit, mặc định null = không giới hạn). Chỉ CẢNH BÁO, và chỉ khi tổng TĂNG so với
// lịch đang lưu (dữ liệu cũ đã vượt thì vẫn lưu được ngày khác). Bộ máy không cắt theo giới hạn này: ngày iSAT vượt vẫn được trả nếu Admin duyệt.
// context: { params, month, clean, prevDays }
class IsatMonthlyLimitRule extends Rule {
  *evaluate({ params, month, clean, prevDays }: any) {
    const limit = params['isat.monthlyLimit'];
    if (typeof limit !== 'number') return;
    const now = countIsat(clean);
    if (now > limit && now > countIsat(prevDays))
      yield Violation.warn(
        'SHEET_ISAT_LIMIT',
        `Tháng ${month}: iSAT tối đa ${limit} ngày (đang khai ${now} ngày)`,
        `Nếu Admin duyệt, bộ máy vẫn trả lương cho cả ${now} ngày iSAT.`
      );
  }
}

export = { IsatMonthlyLimitRule };
