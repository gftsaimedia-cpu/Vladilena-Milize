'use strict';
const { benefitOf } = require('../platform/request-rules');
const WorkSchedule = require('../engine/work-schedule');

// Lý do một ngày iSAT không hợp lệ, hoặc null khi hợp lệ: chức vụ (và bậc) của người phải có quyền lợi iSAT (benefit.isat),
// và ngày phải đúng thứ isat.weekday. Trả { code, message }: BENEFIT_NOT_ALLOWED khi thiếu quyền lợi, SHEET_ISAT_WEEKDAY khi sai thứ.
// Chặn cứng (PUT /sheet, duyệt khoản iSAT); danh sách kiểm chốt công đếm các ngày iSAT đã lưu vi phạm bằng cùng hàm này.
function isatRefusal({ params, staff, date }: any) {
  const day = `${date.slice(8)}/${date.slice(5, 7)}`;
  if (!benefitOf(params, staff.type, 'isat', staff.level))
    return { code: 'BENEFIT_NOT_ALLOWED', message: `Ngày ${day}: chức vụ này không có quyền lợi iSAT.` };
  const [y, m, d] = date.split('-').map(Number);
  if (new Date(y, m - 1, d).getDay() !== params['isat.weekday'])
    return {
      code: 'SHEET_ISAT_WEEKDAY',
      message: `Ngày ${day}: iSAT chỉ áp dụng vào ${WorkSchedule.DAY_NAME[params['isat.weekday']]}.`
    };
  return null;
}

export = { isatRefusal };
