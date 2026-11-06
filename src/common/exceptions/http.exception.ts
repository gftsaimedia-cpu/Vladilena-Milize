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

/** Ngày nằm ngoài thời gian làm việc của nhân sự (chưa vào làm hoặc đã nghỉ việc): mã `NOT_EMPLOYED`, 409. */
export class NotEmployedError extends ConflictError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, { code: 'NOT_EMPLOYED', ...details });
  }
}

const dmy = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/**
 * Câu lỗi nếu `date` (YYYY-MM-DD) nằm ngoài [startDate, resignedOn] (hai đầu đều tính là còn làm); null nếu trong khoảng.
 * Thiếu mốc nào thì phía đó không giới hạn. Cùng luật `activeIn` của tổng quan.
 */
export function employmentGap(
  emp: { startDate?: string | null; resignedOn?: string | null },
  date: string
): string | null {
  if (emp.startDate && date < emp.startDate) {
    return `Ngày ${dmy(date)} nằm ngoài thời gian làm việc (vào làm từ ${dmy(emp.startDate)})`;
  }
  if (emp.resignedOn && date > emp.resignedOn) {
    return `Ngày ${dmy(date)} nằm ngoài thời gian làm việc (đã nghỉ việc từ ${dmy(emp.resignedOn)})`;
  }
  return null;
}

/**
 * Còn làm ít nhất một ngày trong tháng `month` (YYYY-MM): chưa vào làm sau cuối tháng hoặc đã nghỉ việc trước đầu tháng thì không.
 * Mốc thiếu hoặc không đúng dạng YYYY-MM-DD thì phía đó không giới hạn. Dùng cho tập người có phiếu lương của kỳ.
 */
export function employedInMonth(emp: { startDate?: string | null; resignedOn?: string | null }, month: string): boolean {
  const day = (v?: string | null) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
  const start = day(emp.startDate);
  const end = day(emp.resignedOn);
  if (start && start > `${month}-31`) return false;
  if (end && end < `${month}-01`) return false;
  return true;
}

/** Ném `NotEmployedError` nếu có ngày nào trong `dates` nằm ngoài thời gian làm việc. */
export function assertEmployed(emp: { startDate?: string | null; resignedOn?: string | null }, dates: readonly string[]): void {
  for (const date of dates) {
    const gap = employmentGap(emp, date);
    if (gap) throw new NotEmployedError(gap, { date });
  }
}
