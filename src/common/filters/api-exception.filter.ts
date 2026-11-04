import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { HttpError } from '../exceptions/http.exception';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    if (res.headersSent || res.writableEnded) {
      console.error('ApiExceptionFilter: headers already sent', error);
      return;
    }

    // Custom HttpError (or any error with numeric status and message)
    if (error instanceof HttpError) {
      res.status(error.status).json({
        error: error.message,
        ...(error.details || {}),
      });
      return;
    }

    if (error && typeof error.status === 'number' && typeof error.message === 'string') {
      res.status(error.status).json({
        error: error.message,
        code: error.code || 'HTTP_ERROR',
        ...(error.details || {}),
      });
      return;
    }

    // PostgreSQL Unique Constraint Violation (23505)
    if (error && error.code === '23505') {
      res.status(409).json({
        error: 'Dữ liệu vừa được người khác thay đổi hoặc đã tồn tại',
        code: 'CONFLICT',
      });
      return;
    }

    // Log unhandled server error and return 500 JSON
    console.error('Unhandled Server Error:', error);
    res.status(500).json({
      error: 'Lỗi máy chủ',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
