'use strict';
// Danh mục ca làm trong DB: mã Normal1…Night2, tên, loại phụ cấp (normal | flex | night), thứ tự, ngưng dùng.
// Giờ vào/ra của ca vẫn sửa ở Cài đặt › Ca làm (PUT /api/settings/shifts, theo tháng áp dụng).
//   GET /api/catalog/shifts                     { shifts: [{ code, preset, name, kind, sort, deprecated, rev }] }
//   PUT /api/catalog/shifts { code, changes: { name?, kind?, sort?, deprecated? }, expectedRev, reason? }
// Loại ca không có tháng áp dụng riêng: đổi loại ca có hiệu lực cho mọi tháng, nên kiểm khoá kỳ của tháng hiện tại.
const { HttpError, send, readJson } = require('../../http');
const { vnToday } = require('../../request-rules');
const { container } = require('../container');
const { applyCatalogChange } = require('../shared/catalog-change');

const bad = (message, code) => new HttpError(400, message, { code });

async function handle({ req, res, seg, me, actx }) {
  const shifts = container.shifts;
  if (seg.length === 3 && req.method === 'GET') return send(res, 200, { shifts: await shifts.list() });
  if (seg.length === 3 && req.method === 'PUT') {
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || typeof body.code !== 'string' || !body.code)
      throw bad('Cần code của ca', 'SHIFT_CODE_REQUIRED');
    if (!body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes))
      throw bad('Cần changes là đối tượng các trường muốn sửa', 'CATALOG_CHANGES_REQUIRED');
    if (body.expectedRev === undefined || body.expectedRev === null || body.expectedRev === '')
      throw bad('Thiếu số phiên bản (expectedRev) của ca', 'CATALOG_REV_REQUIRED');
    const code = await shifts.canonicalOf(body.code) || body.code;
    const saved = await applyCatalogChange(me, actx, {
      effectiveMonth: vnToday().slice(0, 7),
      reason: body.reason,
      entity: { action: 'catalog.shift.save', entityKind: 'shift', entityId: code },
      run: async at => await shifts.save(code, body.changes, { by: me.username, at, expectedRev: Number(body.expectedRev) })
    });
    return send(res, 200, { shift: saved.after, configRev: saved.configRev });
  }
  throw new HttpError(404, 'Không có đường dẫn này');
}

module.exports = { handle };
