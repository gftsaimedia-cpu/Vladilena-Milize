'use strict';
const paramsSave = require('../params/save');
const events = require('../events');
const { HttpError, send, readJson } = require('../http');

// Route của khối phụ cấp do C&B thêm. server.js gọi MỘT dòng cho mọi đường dẫn /api/blocks/...; quyền đã kiểm ở ROUTE_CAPS.
//   POST /api/blocks                 (config.payroll)  { label, method, values | positions, … }   → { code, block, …kết quả save() }
//   PUT  /api/blocks/:mã/confirm     (config.legal)    { basis, effectiveMonth? }                → { code, confirmedBy, confirmedAt, … }
// Cả hai đi qua save() của lib/params/save.js (một giao dịch, tháng áp dụng, lý do, nhật ký, khoá kỳ) rồi báo params.changed SAU khi đã COMMIT.
const CODE_RE = /^[a-z][a-z0-9]*$/;

async function handle({ req, res, seg, me, actx }) {
  let saved;
  if (seg.length === 2 && req.method === 'POST') saved = paramsSave.addBlock(me, actx, await readJson(req));
  else if (seg.length === 4 && seg[3] === 'confirm' && req.method === 'PUT') {
    if (!CODE_RE.test(seg[2])) throw new HttpError(400, 'Mã khoản không hợp lệ', { code: 'BAD_ID' });
    saved = paramsSave.confirmBlock(me, actx, seg[2], await readJson(req));
  } else throw new HttpError(404, 'Không có đường dẫn này');
  if (saved.notice) events.emit.paramsChanged(saved.notice);
  return send(res, 200, saved);
}

module.exports = { handle };
