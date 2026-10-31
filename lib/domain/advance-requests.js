'use strict';
// Route đọc lịch sử yêu cầu ứng lương.
// server.js không có gì ở đây: lib/domain/routes.js gửi đường dẫn /api/advance-requests tới handle(). Quyền ở cổng ROUTE_CAPS (lib/authz.js);
// đọc bảng ở lib/advance-requests.js; mức tối đa do bộ máy lương tính (lib/advance-cap.js).
//   GET  /api/advance-requests?month=[&username=][&status=]   { month, scope, items, pending?, cap, granted, remaining, eligible, reason? }
//        nhân sự: của mình, kèm cap (đồng) = mức tối đa của tháng; người có quyền duyệt (hoặc xem lương): mọi người (không có cap), hoặc một người nếu có username
// Số đã duyệt ở đây không trừ vào phiếu; tạm ứng là số theo quy tắc, chỉ trừ khi Admin duyệt (lib/domain/advance/routes.js).
const store = require('../db');
const authz = require('../authz');
const advances = require('../advance-requests');
const advanceCap = require('../advance-cap');
const { HttpError, send } = require('../http');
const { validMonth, USERNAME_RE } = require('./input');

// Mức tối đa của một người trong tháng, phẳng để giao diện đọc thẳng: cap (đồng), granted (đã duyệt), remaining (còn được ứng), eligible và reason khi không được ứng
const capView = info => ({
  cap: info.cap,
  granted: info.granted,
  remaining: info.remaining,
  eligible: info.eligible,
  ...(info.reason ? { reason: info.reason } : {})
});
// Mã lỗi của lib/advance-requests.js mang httpStatus; chuyển thành HttpError để send() trả đúng mã
const wrap = fn => {
  try {
    return fn();
  } catch (e) {
    if (e && e.httpStatus && !(e instanceof HttpError))
      throw new HttpError(e.httpStatus, e.message, { code: e.code, ...(e.details || {}) });
    throw e;
  }
};
// Người xem được yêu cầu của người khác: có quyền duyệt (ở phạm vi tất cả) hoặc xem lương
const viewsAll = me => authz.scopeOf(me, advances.DECIDE_CAP) === 'all' || authz.scopeOf(me, 'payroll.view') === 'all';

function list({ res, url, me }) {
  const q = url.searchParams;
  const month = q.get('month');
  if (!validMonth(month)) throw new HttpError(400, 'month phải có dạng YYYY-MM', { code: 'BAD_MONTH' });
  const status = q.get('status') || undefined;
  const asked = q.get('username') ? q.get('username').toLowerCase() : undefined;
  if (asked !== undefined && !USERNAME_RE.test(asked)) throw new HttpError(400, 'username không hợp lệ');
  const all = viewsAll(me);
  if (asked !== undefined && asked !== me.username && !all)
    throw new HttpError(403, 'Chỉ xem được yêu cầu ứng lương của chính mình', { code: 'FORBIDDEN_CAP' });
  const target = asked !== undefined ? asked : all ? undefined : me.username;
  const items = wrap(() => advances.list({ month, username: target, status })).map(r => {
    const person = store.getStaff(r.username);
    return { ...r, name: person ? person.name : r.username };
  });
  return send(res, 200, {
    month,
    scope: target === undefined ? 'all' : target === me.username ? 'self' : 'person',
    ...(target !== undefined ? capView(advanceCap.capOf(target, month)) : {}),
    pending: all ? advances.pendingCount(month) : undefined, // chờ duyệt của tháng này
    pendingAll: all ? advances.pendingFor(me) : undefined, // chờ duyệt mọi tháng mà người xem duyệt được (huy hiệu "Yêu cầu")
    items
  });
}

async function handle({ req, res, seg, url, me }) {
  if (seg.length === 2 && req.method === 'GET') return list({ res, url, me });
  throw new HttpError(404, 'Không có đường dẫn này');
}
module.exports = { handle };
