'use strict';
// Lỗi nghiệp vụ dùng chung cho mọi module trong src/domain. Mang `code` (UPPER_SNAKE) và `httpStatus` nên server.js trả đúng mã và câu
// tiếng Việt cho người dùng (nhánh "lỗi có mã của store"), không thành 500 "Lỗi máy chủ" như Error trần.
class DomainError extends Error {
  declare httpStatus: any;
  declare code: any;
  declare details: any;

  // status: mã HTTP (4xx); code: mã lỗi API; details: trường thêm trả cho giao diện (ví dụ { current: rev })
  constructor(status?, code?, message?, details?) {
    super(message);
    this.httpStatus = status;
    this.code = code;
    if (details) this.details = details;
  }

  static invalid(code?, message?, details?) {
    return new DomainError(400, code, message, details);
  }

  static notFound(code?, message?) {
    return new DomainError(404, code, message);
  }

  static conflict(code?, message?, details?) {
    return new DomainError(409, code, message, details);
  }

  static forbidden(code?, message?) {
    return new DomainError(403, code, message);
  }
}

export = { DomainError };
