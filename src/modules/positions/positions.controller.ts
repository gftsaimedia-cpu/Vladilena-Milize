import { Body, Controller, Inject, Param, Post, Put, UseFilters } from '@nestjs/common';
import {
  ApiExceptionFilter,
  BadRequestError,
  ConflictError,
  CurrentUser,
  NotFoundError,
  RequireCap,
  UserSession
} from '../../common';
import {
  LevelNotFoundError,
  LevelStaleError,
  PositionInputError,
  PositionNotFoundError,
  PositionStaleError
} from './positions.errors';
import { PositionsService } from './positions.service';

/** Ghi chức vụ và bậc theo tháng áp dụng (màn Cài đặt › Chức vụ và bậc, Chế độ theo loại). */
@Controller('api/v2/positions')
@UseFilters(ApiExceptionFilter)
export class PositionsController {
  constructor(@Inject(PositionsService) private readonly service: PositionsService) {}

  @RequireCap('config.write')
  @Put()
  async savePositions(@Body() body: unknown, @CurrentUser() user: UserSession): Promise<unknown> {
    return this.run(() => this.service.savePositions(body, user.username));
  }

  @RequireCap('config.write')
  @Put(':code/levels/:level')
  async saveLevel(
    @Param('code') code: string,
    @Param('level') level: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    return this.run(() => this.service.saveLevel(code, level, body, user.username));
  }

  @RequireCap('config.write')
  @Post(':code/levels')
  async addLevel(@Param('code') code: string, @Body() body: unknown, @CurrentUser() user: UserSession): Promise<unknown> {
    return this.run(() => this.service.addLevel(code, body, user.username));
  }

  /** Lỗi của module → mã HTTP của spec; lỗi khác (DB...) đi tiếp qua ApiExceptionFilter. */
  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err: unknown) {
      if (err instanceof PositionInputError) throw new BadRequestError(err.message, { code: 'BAD_REQUEST', field: err.field });
      if (err instanceof PositionNotFoundError) throw new NotFoundError(err.message, { code: 'POSITION_NOT_FOUND' });
      if (err instanceof LevelNotFoundError) throw new NotFoundError(err.message, { code: 'LEVEL_NOT_FOUND' });
      if (err instanceof PositionStaleError) throw new ConflictError(err.message, { code: 'POSITION_STALE' });
      if (err instanceof LevelStaleError) throw new ConflictError(err.message, { code: 'LEVEL_STALE' });
      throw err;
    }
  }
}
