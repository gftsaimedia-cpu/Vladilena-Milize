'use strict';
// Check-out muộn: Check-out sau giờ kết thúc ca (cộng phần làm thêm đã khai) quá config.CHECKOUT_GRACE_MIN phút thì phải giải trình;
// giờ Check-out đó chỉ được tính khi Admin duyệt (late-checkout-session.js). Thuần: không đọc DB.
const { spanH } = require('../overtime/worked-hours').WorkedHours;
const config = require('../../platform/config');

const MIN_PER_HOUR = 60;
const MS_PER_MIN = 60000;

// Số phút Check-out muộn hơn giờ kết thúc ca. session: lượt đang mở (entry.plannedShift từ lúc Check-in); sheetDay: ngày khai trong Lịch ước
// tính (có thể mang giờ làm thêm sau ca). Khoảng được phép = giờ kết thúc ca + đoạn làm thêm sau ca đã khai (lấy giá trị lớn hơn của lượt và
// của lịch). Không có ca theo lịch (ngoài ca) thì không so được: trả 0.
function lateCheckoutMin(session?, atIso?, sheetDay?) {
  const planned = session && session.entry && session.entry.plannedShift;
  if (!planned || !planned.endIso || !planned.out) return 0;
  const afterMin = (extraOut?) => (extraOut ? Math.round(spanH(planned.out, extraOut) * MIN_PER_HOUR) : 0);
  const extra = Math.max(afterMin(session.entry.extraOut), afterMin(sheetDay && sheetDay.extraOut));
  const allowedUntil = Date.parse(planned.endIso) + extra * MS_PER_MIN;
  return Math.max(0, Math.round((Date.parse(atIso) - allowedUntil) / MS_PER_MIN));
}

const needsExplanation = (session?, atIso?, sheetDay?) =>
  lateCheckoutMin(session, atIso, sheetDay) >= config.CHECKOUT_GRACE_MIN;

export = { lateCheckoutMin, needsExplanation };
