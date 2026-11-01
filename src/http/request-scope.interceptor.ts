import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';
import warnings = require('../../lib/warnings');
import { withRequestWarnings } from './reply';
import { requestRules } from '../../lib/request-rules';
import { announceAttendance } from '../../lib/announce';
import { announcePunches } from '../../lib/domain/attendance';

/**
 * Phạm vi của MỘT yêu cầu: cảnh báo gom theo yêu cầu (lib/warnings.js), bộ quy tắc theo tháng dựng một lần (lib/request-rules.js).
 * Sau khi route xong (đã COMMIT) mới báo tin cho màn đang mở: chấm công mới và cấu hình đổi.
 */
@Injectable()
export class RequestScopeInterceptor implements NestInterceptor {
  intercept(_host: ExecutionContext, next: CallHandler): Observable<unknown> {
    const run = async () => {
      const result = await warnings.run(async () => {
        const value = await requestRules.run(
          new Map(),
          async () => await lastValueFrom(next.handle(), { defaultValue: undefined })
        );
        return withRequestWarnings(value); // cảnh báo của yêu cầu gắn vào phản hồi ngay trong phạm vi của nó
      });
      // Phản hồi được ghi SAU interceptor này (ReplyAdapter), dữ liệu đã COMMIT: lỗi khi báo tin chỉ ghi log, không đổi kết quả thành 500
      try {
        announceAttendance();
        await announcePunches();
      } catch (error) {
        console.error(error);
      }
      return result;
    };
    return from(run());
  }
}
