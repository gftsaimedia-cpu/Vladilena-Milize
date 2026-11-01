'use strict';
// Route của khoản điền thêm theo người theo tháng.
// server.js gọi MỘT dòng: payEntries.handle({ req, res, seg, url, me, actx }) cho mọi đường dẫn /api/pay-entries/...
// Quyền đã kiểm ở cổng ROUTE_CAPS của server.js (src/platform/authz.ts); quy tắc, kiểm đầu vào, khoá kỳ và nhật ký ở src/domain/payroll/pay-entries.ts.
//   GET  /api/pay-entries?month=&username=&status=     (salary.read)       { month, periodStatus, requireApproval, entries }
//   POST /api/pay-entries                              (salary.write)      { entry }
//   POST /api/pay-entries/bulk                         (salary.write)      { count, entries }   tất cả hoặc không
//   PUT  /api/pay-entries/:id                          (salary.write)      { entry }            sửa khi chờ duyệt, cần rev
//   PUT  /api/pay-entries/:id/decide { decision, note, rev }  (payroll.approve)  { entry }
//   POST /api/pay-entries/:id/void { rev?, reason? }   (salary.write)      { entry }
//   POST /api/pay-entries/:id/confirm-flags { rev }    (config.legal)      { entry }            Kế toán xác nhận cờ thuế, bảo hiểm
// Khoản đã duyệt (hoặc có hiệu lực ngay) làm ước tính của người đó đổi: báo estimate.changed cho đúng người sau khi đã COMMIT.
const store = require('../platform/db');
const events = require('../platform/events');
const entries = require('./payroll/pay-entries');
const { HttpError, send, readJson } = require('../platform/http');
const { validMonth } = require('./input');

const ID_RE = /^[0-9]+$/;
function idOf(segment?) {
  if (!ID_RE.test(String(segment))) throw new HttpError(400, 'Mã khoản không hợp lệ', { code: 'BAD_ID' });
  return Number(segment);
}
const notify = (entry?) => {
  if (entry && entry.status === 'approved') events.emit.estimateChanged(entry.username, entry.month);
};

async function handle({ req, res, seg, url, me, actx }: any) {
  const method = req.method;
  if (seg.length === 2) {
    if (method === 'GET') {
      const q = url.searchParams;
      const month = q.get('month');
      if (!validMonth(month)) throw new HttpError(400, 'month phải có dạng YYYY-MM', { code: 'BAD_MONTH' });
      const rows = await entries.list({
        month,
        username: q.get('username') || undefined,
        status: q.get('status') || undefined
      });
      return send(res, 200, {
        month,
        periodStatus: await store.periods.status(month),
        requireApproval: (await entries.limitsFor(month)).requireApproval,
        entries: rows
      });
    }
    if (method === 'POST') {
      const entry = await entries.create(await readJson(req), me, actx);
      notify(entry);
      return send(res, 200, { entry });
    }
  }
  if (seg.length === 3 && seg[2] === 'bulk' && method === 'POST') {
    const made = await entries.createBulk(await readJson(req), me, actx);
    made.forEach(notify);
    return send(res, 200, { count: made.length, entries: made });
  }
  if (seg.length === 3 && method === 'PUT') {
    const entry = await entries.update(idOf(seg[2]), await readJson(req), me, actx);
    return send(res, 200, { entry });
  }
  if (seg.length === 4 && seg[3] === 'decide' && method === 'PUT') {
    const entry = await entries.decide(idOf(seg[2]), await readJson(req), me, actx);
    notify(entry);
    return send(res, 200, { entry });
  }
  if (seg.length === 4 && seg[3] === 'void' && method === 'POST') {
    const { entry, wasApproved } = await entries.voidEntry(idOf(seg[2]), await readJson(req), me, actx);
    if (wasApproved) events.emit.estimateChanged(entry.username, entry.month);
    return send(res, 200, { entry });
  }
  if (seg.length === 4 && seg[3] === 'confirm-flags' && method === 'POST') {
    const entry = await entries.confirmFlags(idOf(seg[2]), await readJson(req), me, actx);
    notify(entry);
    return send(res, 200, { entry });
  }
  throw new HttpError(404, 'Không có đường dẫn này');
}

export = { handle };
