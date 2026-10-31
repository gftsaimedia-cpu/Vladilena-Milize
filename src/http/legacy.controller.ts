import { All, Controller, Inject, Res } from '@nestjs/common';
import { Ctx, ApiContext } from './api-context';

export const LEGACY_API = Symbol('LEGACY_API');
export type LegacyApi = (ctx: ApiContext) => Promise<unknown>;

/** Route chưa chuyển sang module Nest: giao cho bộ xử lý cũ (server.js → api). Giảm dần tới khi không còn route nào rơi vào đây. */
@Controller('api')
export class LegacyController {
  constructor(@Inject(LEGACY_API) private readonly legacy: LegacyApi) {}

  @All('*')
  // @Res(): bộ xử lý tự gửi phản hồi (kể cả gửi chậm sau khi nén), Nest không được tự kết thúc phản hồi
  async handle(@Ctx() ctx: ApiContext, @Res() _res: unknown): Promise<void> {
    await this.legacy(ctx);
  }
}
