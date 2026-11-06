import { Injectable, type PipeTransform } from '@nestjs/common';
import { NotFoundError } from '../../common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `:id` của đơn phải là UUID. Mã khác không thể là đơn nào: trả 404 ngay, không để xuống SQL rồi lộ câu lỗi của PostgreSQL. */
@Injectable()
export class RequestIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !UUID.test(value)) {
      throw new NotFoundError('Không tìm thấy đơn', { code: 'REQUEST_NOT_FOUND' });
    }
    return value;
  }
}
