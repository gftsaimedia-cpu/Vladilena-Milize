'use strict';
// 14 cờ quyền lợi của một chức vụ. Dùng chung cho CHECK của bảng position_benefits và cho lớp Position.
const BENEFITS = [
  'ot',
  'makeup',
  'kpi',
  'paidHoliday',
  'paidLeave',
  'isat',
  'absenceDeclarable',
  'approvedLeave',
  'leaveAccount',
  'makeupHours',
  'makeupDay', // không còn dùng
  'holidayWork', // đã bỏ: làm ngày lễ là OT nên theo 'ot'; chỉ còn để giữ hàng đã gieo trong DB, bộ máy bỏ qua (RETIRED_BENEFITS)
  'idorm',
  'breakPay'
];

// Quyền lợi đã bỏ: còn dòng lưu trong bảng nhưng danh mục, bộ tham số và bộ máy không đọc
const RETIRED_BENEFITS = ['holidayWork'];

export = { BENEFITS, RETIRED_BENEFITS };
