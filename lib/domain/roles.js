'use strict';
const roles = require('../roles');
const { HttpError, send, readJson } = require('../http');

// Vai trò (Cài đặt › Phân quyền); quyền roles.manage đã kiểm ở cổng ROUTE_CAPS (lib/authz.js) trước khi tới đây.
// GET  /api/roles                       danh sách vai trò mặc định + tuỳ chỉnh, khu vực của ma trận, loại yêu cầu duyệt, tài khoản
// POST /api/roles                       { label, copyFrom?, code?, caps? | levels?+extras?, approvals?, scope?, reason? } tạo hoặc sao chép
// PUT  /api/roles/:code                 { rev, label?, caps? | levels?+extras?, approvals?, scope?, reason } sửa vai trò tuỳ chỉnh
// POST /api/roles/:code/deprecate       { rev, reason } ngưng dùng (không xoá)
async function handle({ req, res, seg, me, actx }) {
  const code = seg[2] === undefined ? null : decodeSegment(seg[2]);
  if (req.method === 'GET' && seg.length === 2) return send(res, 200, await roles.describeAll());
  if (req.method === 'POST' && seg.length === 2) return send(res, 200, await roles.create(me, actx, await readJson(req)));
  if (req.method === 'PUT' && seg.length === 3)
    return send(res, 200, await roles.update(me, actx, code, await readJson(req)));
  if (req.method === 'POST' && seg.length === 4 && seg[3] === 'deprecate')
    return send(res, 200, await roles.deprecate(me, actx, code, await readJson(req)));
  throw new HttpError(404, 'Không có đường dẫn này');
}
function decodeSegment(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new HttpError(400, 'Mã vai trò không hợp lệ');
  }
}

module.exports = { handle };
