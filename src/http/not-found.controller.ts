import { All, Controller, Res } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { HttpError } from '../platform/http';

/**
 * Đường dẫn /api/* không module nào nhận. Vẫn đi qua ApiGuard trước (route không có chính sách trong ROUTE_CAPS bị từ chối 403/401,
 * không lộ route nào có thật), tới đây mới là 404. Phải đứng CUỐI danh sách module.
 */
@Controller('api')
export class NotFoundController {
  @All('*')
  async notFound(@Res() _res: unknown): Promise<never> {
    throw new HttpError(404, 'Không có API này');
  }
}

@Module({ controllers: [NotFoundController] })
export class NotFoundModule {}
