import { Controller, Get, Post, Put } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const roles = require('../../domain/roles/roles');
const { HttpError, readJson } = require('../../platform/http');

// Vai trò (Cài đặt › Phân quyền); quyền roles.manage đã kiểm ở cổng ROUTE_CAPS (src/platform/authz.ts) trước khi tới đây.
function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new HttpError(400, 'Mã vai trò không hợp lệ');
  }
}

@Controller('api')
export class RolesController {
  /** danh sách vai trò mặc định + tuỳ chỉnh, khu vực của ma trận, loại yêu cầu duyệt, tài khoản */
  @Get('roles')
  async list(@Ctx() c: ApiContext): Promise<unknown> {
    return await roles.describeAll();
  }

  /** { label, copyFrom?, code?, caps? | levels?+extras?, approvals?, scope?, reason? } tạo hoặc sao chép */
  @Post('roles')
  async create(@Ctx() c: ApiContext): Promise<unknown> {
    return await roles.create(c.me, c.actx, await readJson(c.req));
  }

  /** { rev, label?, caps? | levels?+extras?, approvals?, scope?, reason } sửa vai trò tuỳ chỉnh */
  @Put('roles/:code')
  async update(@Ctx() c: ApiContext): Promise<unknown> {
    return await roles.update(c.me, c.actx, decodeSegment(c.seg[2]), await readJson(c.req));
  }

  /** { rev, reason } ngưng dùng (không xoá) */
  @Post('roles/:code/deprecate')
  async deprecate(@Ctx() c: ApiContext): Promise<unknown> {
    return await roles.deprecate(c.me, c.actx, decodeSegment(c.seg[2]), await readJson(c.req));
  }
}
