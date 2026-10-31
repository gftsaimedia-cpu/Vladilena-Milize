import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { HttpError, send } from '../../lib/http';
import { Overloaded } from '../../lib/ops/limiters';
import { attendanceHints } from '../../lib/announce';
import { punchHints } from '../../lib/domain/attendance';

/** Một nơi đổi mọi lỗi của route thành phản hồi JSON (cùng quy ước với server.js cũ). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    attendanceHints.clear(); // lỗi thì giao dịch đã hoàn tác: không báo
    punchHints.clear();
    // Lỗi xảy ra SAU khi đã trả lời (announce*, báo tin SSE): chỉ ghi log. Trả lời lần hai sẽ ném ERR_HTTP_HEADERS_SENT
    // và một rejection không ai bắt làm Node thoát tiến trình (mất cả hệ thống).
    if (res.headersSent || res.writableEnded) {
      console.error(error);
      return;
    }
    if (error instanceof Overloaded) return send(res, 503, { error: error.message, code: 'OVERLOADED' }, { 'Retry-After': String(error.retryAfterSec) });
    if (error instanceof HttpError) return send(res, error.status, { error: error.message, ...error.details }, (error as any).headers);
    // Lỗi có mã của store (PERIOD_LOCKED, SLIP_STALE, REASON_REQUIRED...): code và mã HTTP do store quyết, chi tiết trải ra như HttpError
    if (error && typeof error.code === 'string' && Number.isInteger(error.httpStatus) && error.httpStatus < 500)
      return send(res, error.httpStatus, { error: error.message, code: error.code, ...error.details });
    console.error(error);
    send(res, 500, { error: 'Lỗi máy chủ' });
  }
}
