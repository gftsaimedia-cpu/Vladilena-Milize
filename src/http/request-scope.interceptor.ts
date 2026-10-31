import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';
import warnings = require('../../lib/warnings');
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
      const result = await warnings.run(async () => await requestRules.run(new Map(), async () => await lastValueFrom(next.handle(), { defaultValue: undefined })));
      announceAttendance();
      await announcePunches();
      return result;
    };
    return from(run());
  }
}
