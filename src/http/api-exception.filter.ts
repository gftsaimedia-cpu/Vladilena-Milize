import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { HttpError, send } from '../platform/http';
import { Overloaded } from '../ops/limiters';
import { attendanceHints } from '../platform/announce';
import { punchHints } from '../domain/attendance';

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
    if (error instanceof Overloaded)
      return send(
        res,
        503,
        { error: error.message, code: 'OVERLOADED' },
        { 'Retry-After': String(error.retryAfterSec) }
      );
    if (error instanceof HttpError)
      return send(res, error.status, { error: error.message, ...error.details }, (error as any).headers);
    // Lỗi có mã của store (PERIOD_LOCKED, SLIP_STALE, REASON_REQUIRED...): code và mã HTTP do store quyết, chi tiết trải ra như HttpError
    if (error && typeof error.code === 'string' && Number.isInteger(error.httpStatus) && error.httpStatus < 500)
      return send(res, error.httpStatus, { error: error.message, code: error.code, ...error.details });
    // Vi phạm ràng buộc duy nhất của PostgreSQL (23505): hai yêu cầu cùng lúc chạm một dòng; bên thua là xung đột, không phải lỗi máy chủ
    if (error && error.code === '23505')
      return send(res, 409, {
        error: 'Dữ liệu vừa được người khác thay đổi, hãy tải lại rồi làm lại',
        code: 'CONFLICT'
      });
    console.error(error);
    send(res, 500, { error: 'Lỗi máy chủ' });
  }
}
