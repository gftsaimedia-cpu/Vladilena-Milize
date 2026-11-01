import { Inject, CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';
import warnings = require('../platform/warnings');
import { withRequestWarnings } from './reply';
import { RULES } from '../core/tokens';
import { announceAttendance } from '../platform/announce';
import { announcePunches } from '../domain/attendance';

/**
 * Phạm vi của MỘT yêu cầu: cảnh báo gom theo yêu cầu (src/platform/warnings.ts), bộ quy tắc theo tháng dựng một lần (src/platform/request-rules.ts).
 * Sau khi route xong (đã COMMIT) mới báo tin cho màn đang mở: chấm công mới và cấu hình đổi.
 */
@Injectable()
export class RequestScopeInterceptor implements NestInterceptor {
  constructor(@Inject(RULES) private readonly rules: any) {}

  intercept(_host: ExecutionContext, next: CallHandler): Observable<unknown> {
    const run = async () => {
      const result = await warnings.run(async () => {
        const value = await this.rules.requestRules.run(
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
