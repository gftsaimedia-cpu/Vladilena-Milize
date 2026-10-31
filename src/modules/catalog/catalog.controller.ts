import { Controller, Get, Put, Res } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const config = require('../../../lib/config');
const { HttpError, send, readJson } = require('../../../lib/http');
const { validMonth } = require('../../../lib/domain/input');
const { vnToday } = require('../../../lib/request-rules');
const { container } = require('../../../lib/domain/container');
const { applyCatalogChange } = require('../../../lib/domain/shared/catalog-change');
const { CODE_RE } = require('../../../lib/domain/position/position-catalog');

const bad = (message: string, code: string) => new HttpError(400, message, { code });
const revRequired = () => bad('Thiếu số phiên bản (expectedRev) của dòng đang sửa', 'CATALOG_REV_REQUIRED');
const hasRev = (body: any) => body.expectedRev !== undefined && body.expectedRev !== null && body.expectedRev !== '';

async function readChange(req: any) {
  const body = await readJson(req);
  if (!body || typeof body !== 'object' || !body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes))
    throw bad('Cần changes là đối tượng các trường muốn sửa', 'CATALOG_CHANGES_REQUIRED');
  if (!validMonth(body.effectiveMonth)) throw bad('effectiveMonth phải dạng YYYY-MM', 'BAD_MONTH');
  return body;
}

/**
 * Danh mục chức vụ, bậc và ca làm trong DB (Admin sửa thẳng ở màn Admin, có phiên bản theo tháng áp dụng).
 * Bảng lương đọc danh mục qua bộ tham số của tháng (lib/params/store.js), nên sửa ở đây có hiệu lực từ tháng áp dụng như sửa tham số.
 */
@Controller('api')
export class CatalogController {
  /** ?month= → { month, baseMonth, benefits, positions: [{ code, name, …, benefits, rev, levels }] }; baseMonth: tháng của dòng nền nạp từ bộ mặc định */
  @Get('catalog/positions')
  async listPositions(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const positions = container.positions;
    const month = c.url.searchParams.get('month') || vnToday().slice(0, 7);
    if (!validMonth(month)) throw bad('month phải dạng YYYY-MM', 'BAD_MONTH');
    return send(c.res, 200, {
      month,
      baseMonth: config.CATALOG_BASE_MONTH,
      benefits: await positions.benefitCodes(),
      positions: await positions.forMonth(month)
    });
  }

  /** { changes, effectiveMonth, reason?, expectedRev }; changes: một phần { name, workdays, flexPct, nightPct, travelPct, attendancePct, regularDows, benefits } */
  @Put('catalog/positions/:code')
  async savePosition(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { me, actx, seg, req, res } = c;
    const positions = container.positions;
    const code = seg[3];
    if (!CODE_RE.test(code)) throw bad('Mã chức vụ không hợp lệ', 'POSITION_BAD_CODE');
    const body = await readChange(req);
    if (!hasRev(body)) throw revRequired();
    const saved = await applyCatalogChange(me, actx, {
      effectiveMonth: body.effectiveMonth,
      reason: body.reason,
      entity: { action: 'catalog.position.save', entityKind: 'position', entityId: code },
      run: async (at: string) =>
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

  /** { type, level, changes, effectiveMonth, reason?, expectedRev? }; expectedRev bắt buộc khi sửa bậc đã có, bỏ trống khi thêm bậc kế tiếp */
  @Put('catalog/levels')
  async saveLevel(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { me, actx, req, res } = c;
    const positions = container.positions;
    const body = await readChange(req);
    const type = String(body.type || '');
    const level = Number(body.level);
    if (!CODE_RE.test(type)) throw bad('Mã chức vụ không hợp lệ', 'POSITION_BAD_CODE');
    if (!hasRev(body) && (await positions.levelRowAt(type, level, body.effectiveMonth))) throw revRequired();
    const saved = await applyCatalogChange(me, actx, {
      effectiveMonth: body.effectiveMonth,
      reason: body.reason,
      entity: { action: 'catalog.level.save', entityKind: 'position-level', entityId: `${type}:${level}` },
      run: async (at: string) =>
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

  /** { shifts: [{ code, preset, name, kind, sort, deprecated, rev }] } */
  @Get('catalog/shifts')
  async listShifts(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    return send(c.res, 200, { shifts: await container.shifts.list() });
  }

  /**
   * { code, changes: { name?, kind?, sort?, deprecated? }, expectedRev, reason? }
   * Loại ca không có tháng áp dụng riêng: đổi loại ca có hiệu lực cho mọi tháng, nên kiểm khoá kỳ của tháng hiện tại.
   */
  @Put('catalog/shifts')
  async saveShift(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { me, actx, req, res } = c;
    const shifts = container.shifts;
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || typeof body.code !== 'string' || !body.code)
      throw bad('Cần code của ca', 'SHIFT_CODE_REQUIRED');
    if (!body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes))
      throw bad('Cần changes là đối tượng các trường muốn sửa', 'CATALOG_CHANGES_REQUIRED');
    if (body.expectedRev === undefined || body.expectedRev === null || body.expectedRev === '')
      throw bad('Thiếu số phiên bản (expectedRev) của ca', 'CATALOG_REV_REQUIRED');
    const code = (await shifts.canonicalOf(body.code)) || body.code;
    const saved = await applyCatalogChange(me, actx, {
      effectiveMonth: vnToday().slice(0, 7),
      reason: body.reason,
      entity: { action: 'catalog.shift.save', entityKind: 'shift', entityId: code },
      run: async (at: string) => await shifts.save(code, body.changes, { by: me.username, at, expectedRev: Number(body.expectedRev) })
    });
    return send(res, 200, { shift: saved.after, configRev: saved.configRev });
  }
}
