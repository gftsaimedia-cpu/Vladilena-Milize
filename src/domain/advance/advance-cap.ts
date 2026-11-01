'use strict';
const { AsyncList } = require('../../shared/async-list');
// Số tạm ứng theo quy tắc của một người trong một tháng: đúng công thức tamUng của bộ máy (advance.rate × lương cơ bản thực nhận
// của các ngày đi làm từ ngày 1 đến ngày advance.untilDay; cơ sở theo advance.basis), tính bằng chính bộ máy lương tới HÔM NAY (ngày chưa tới chưa có lương).
// Chỉ ngày có Check-in/out hợp lệ hoặc lượt Admin khai thay có hiệu lực mới là ngày đi làm.
// Số này chỉ trừ vào phiếu khi Admin đã duyệt tạm ứng của người đó trong tháng (src/domain/advance). Trước ngày advance.untilDay của tháng số còn chưa chốt.
// capOf phục vụ GET /api/advance-requests (lịch sử yêu cầu): mức "tối đa" chính là số theo quy tắc.
// Tách khỏi src/domain/advance/advance-requests.ts vì phải gọi src/domain/payroll/payroll-service.ts.
const store = require('../../platform/db');
const service = require('../payroll/payroll-service');
const paramsStore = require('../../params/store');
const PayOptions = require('../../engine/pay-options-calc');
const advances = require('./advance-requests');
const { vnToday } = require('../../platform/request-rules');

// Lỗi hồ sơ không tính được lương (loại hoặc bậc lạ, công thức hỏng): không có số, nói rõ lý do thay vì trả 500
const BAD_PROFILE_CODES = Object.freeze(['PAYROLL_BAD_TYPE', 'PAYROLL_BAD_LEVEL', 'PAYROLL_BAD_FORMULA']);

// Chưa chốt: hôm nay chưa qua ngày advance.untilDay của tháng (tháng tương lai cũng vậy)
const provisionalOf = (month?, params?) =>
  vnToday() <= `${month}-${String(params['advance.untilDay']).padStart(2, '0')}`;

// Một người: { eligible, reason?, amount } (amount đồng nguyên). staff là hồ sơ (store.getStaff); inputs của service.loadInputs (đã gồm người này hoặc không)
function figureFor(month?, staff?, inputs?, params?) {
  const none = (reason?, eligible = false) => ({ eligible, reason, amount: 0 });
  if (!staff || !staff.payrollSubject) return none('Tài khoản này không thuộc diện được trả lương');
  // Điều kiện được ứng: cờ từng người (advanceOn) và chức vụ được tạm ứng (advance.eligibleTypes.<mã>); nói ra trước khi tính để biết lý do
  if (staff.advanceOn === false) return none('Hồ sơ đang tắt tạm ứng lương');
  if (!PayOptions.advanceEligible(params, staff.type)) return none('Chức vụ không thuộc diện được ứng lương');
  if (!inputs.people.has(staff.username)) return none('Chưa bắt đầu làm việc trong tháng này', true);
  try {
    // upTo bỏ trống = tới hôm nay (computeFor xoá upTo khi là undefined)
    const out = service.computeFor(month, inputs.people.get(staff.username).staff, inputs, params, { upTo: undefined });
    return { eligible: true, amount: Math.max(0, Math.round(out.m.trace.tamUngToiDa || 0)) };
  } catch (e) {
    if (e && BAD_PROFILE_CODES.includes(e.code)) return none('Hồ sơ chưa tính được lương, liên hệ C&B để sửa', true);
    throw e;
  }
}

// Nhiều người một lượt (một lần nạp đầu vào): Map tên đăng nhập → { eligible, reason?, amount }; usernames bỏ trống = mọi nhân sự được trả lương.
// Trả kèm provisional của tháng.
async function figuresOf(month?, usernames?) {
  const params = (await paramsStore.resolve(month)).params;
  const inputs = await service.loadInputs(month, usernames ? { usernames } : {});
  const list = usernames
    ? await AsyncList.map(usernames, async u => await store.getStaff(u))
    : (await store.listStaff()).filter(s => s.payrollSubject);
  const out = new Map<any, any>();
  for (const staff of list) if (staff) out.set(staff.username, figureFor(month, staff, inputs, params));
  return { provisional: provisionalOf(month, params), figures: out };
}

// Một người, dạng trả của GET /api/advance-requests: { eligible, reason?, cap, granted, remaining, month } (cap = số theo quy tắc)
async function capOf(username?, month?) {
  const granted = await advances.grantedOf(username, month);
  const staff = await store.getStaff(username);
  const f =
    staff && staff.payrollSubject
      ? (await figuresOf(month, [username])).figures.get(username)
      : { eligible: false, reason: 'Tài khoản này không thuộc diện được trả lương', amount: 0 };
  return {
    month,
    eligible: f.eligible,
    ...(f.reason ? { reason: f.reason } : {}),
    cap: f.amount,
    granted,
    remaining: Math.max(0, f.amount - granted)
  };
}

export = { capOf, figuresOf };
