export class HttpError extends Error {
  status: number;
  details?: Record<string, any>;

  constructor(status: number, message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Không tìm thấy tài nguyên', details?: Record<string, any>) {
    super(404, message, { code: 'NOT_FOUND', ...details });
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Dữ liệu không hợp lệ', details?: Record<string, any>) {
    super(400, message, { code: 'BAD_REQUEST', ...details });
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Xung đột dữ liệu', details?: Record<string, any>) {
    super(409, message, { code: 'CONFLICT', ...details });
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Chưa đăng nhập', details?: Record<string, any>) {
    super(401, message, { code: 'UNAUTHENTICATED', ...details });
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Không có quyền truy cập', details?: Record<string, any>) {
    super(403, message, { code: 'FORBIDDEN', ...details });
  }
}
