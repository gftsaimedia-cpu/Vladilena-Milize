'use strict';
// Danh mục chức vụ và bậc trong DB (Admin sửa thẳng ở màn Admin, có phiên bản theo tháng áp dụng).
//   GET /api/catalog/positions?month=                     { month, baseMonth, benefits, positions: [{ code, name, …, benefits, rev, levels: [...] }] }
//        baseMonth: tháng của dòng nền nạp từ bộ mặc định (config.CATALOG_BASE_MONTH); dòng có effectiveMonth bằng nó chưa từng được Admin sửa
//   PUT /api/catalog/positions/:code { changes, effectiveMonth, reason?, expectedRev }
//        changes: một phần { name, workdays, flexPct, nightPct, travelPct, attendancePct, regularDows, benefits: { cờ: bool } }
//   PUT /api/catalog/levels { type, level, changes, effectiveMonth, reason?, expectedRev? }
//        changes: một phần { name, baseSalary, kpiMax, nightPct }; expectedRev bắt buộc khi sửa bậc đã có, bỏ trống khi thêm bậc kế tiếp
// Bảng lương đọc danh mục qua bộ tham số của tháng (lib/params/store.js), nên sửa ở đây có hiệu lực từ tháng áp dụng như sửa tham số.
const config = require('../../config');
const { HttpError, send, readJson } = require('../../http');
const { validMonth } = require('../input');
const { vnToday } = require('../../request-rules');
const { container } = require('../container');
const { applyCatalogChange } = require('../shared/catalog-change');
const { CODE_RE } = require('./position-catalog');

const bad = (message, code) => new HttpError(400, message, { code });
const revRequired = () => bad('Thiếu số phiên bản (expectedRev) của dòng đang sửa', 'CATALOG_REV_REQUIRED');
const hasRev = body => body.expectedRev !== undefined && body.expectedRev !== null && body.expectedRev !== '';

async function readChange(req) {
  const body = await readJson(req);
  if (
    !body ||
    typeof body !== 'object' ||
    !body.changes ||
    typeof body.changes !== 'object' ||
    Array.isArray(body.changes)
  )
    throw bad('Cần changes là đối tượng các trường muốn sửa', 'CATALOG_CHANGES_REQUIRED');
  if (!validMonth(body.effectiveMonth)) throw bad('effectiveMonth phải dạng YYYY-MM', 'BAD_MONTH');
  return body;
}

async function handle({ req, res, seg, url, me, actx }) {
  const positions = container.positions;
  if (seg[2] === 'positions' && seg.length === 3 && req.method === 'GET') {
    const month = url.searchParams.get('month') || vnToday().slice(0, 7);
    if (!validMonth(month)) throw bad('month phải dạng YYYY-MM', 'BAD_MONTH');
    return send(res, 200, {
      month,
      baseMonth: config.CATALOG_BASE_MONTH,
      benefits: await positions.benefitCodes(),
      positions: await positions.forMonth(month)
    });
  }
  if (seg[2] === 'positions' && seg.length === 4 && req.method === 'PUT') {
    const code = seg[3];
    if (!CODE_RE.test(code)) throw bad('Mã chức vụ không hợp lệ', 'POSITION_BAD_CODE');
    const body = await readChange(req);
    if (!hasRev(body)) throw revRequired();
    const saved = await applyCatalogChange(me, actx, {
      effectiveMonth: body.effectiveMonth,
      reason: body.reason,
      entity: { action: 'catalog.position.save', entityKind: 'position', entityId: code },
      run: async at =>
        await positions.saveType(code, body.changes, {
          effectiveMonth: body.effectiveMonth,
          by: me.username,
          at,
          reason: body.reason,
          expectedRev: body.expectedRev
        })
    });
    return send(res, 200, { position: saved.after, configRev: saved.configRev });
  }
  if (seg[2] === 'levels' && seg.length === 3 && req.method === 'PUT') {
    const body = await readChange(req);
    const type = String(body.type || '');
    const level = Number(body.level);
    if (!CODE_RE.test(type)) throw bad('Mã chức vụ không hợp lệ', 'POSITION_BAD_CODE');
    if (!hasRev(body) && await positions.levelRowAt(type, level, body.effectiveMonth)) throw revRequired();
    const saved = await applyCatalogChange(me, actx, {
      effectiveMonth: body.effectiveMonth,
      reason: body.reason,
      entity: { action: 'catalog.level.save', entityKind: 'position-level', entityId: `${type}:${level}` },
      run: async at =>
        await positions.saveLevel(type, level, body.changes, {
          effectiveMonth: body.effectiveMonth,
          by: me.username,
          at,
          reason: body.reason,
          expectedRev: body.expectedRev
        })
    });
    return send(res, 200, { level: saved.after, configRev: saved.configRev });
  }
  throw new HttpError(404, 'Không có đường dẫn này');
}

module.exports = { handle };
