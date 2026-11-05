import { BadRequestError, ConflictError, HttpError } from '../../common';
import { DayConflictError, type SystemRequestDTO } from './domain';
import type { CreatedRequestDTO } from './requests.service';

/** Thân trả về của route tạo đơn: `warnings` đứng cạnh `request`, không nằm trong đơn. */
export function createdBody(dto: CreatedRequestDTO): { created: true; request: SystemRequestDTO; warnings: string[] } {
  const { warnings, ...request } = dto;
  return { created: true, request: request as SystemRequestDTO, warnings: warnings ?? [] };
}

/**
 * Xung đột ngày → lỗi HTTP mã `DAY_CONFLICT` (400 lúc nộp, 409 lúc duyệt), `details` mang ngày và đơn đang chiếm.
 * Lỗi đã là `HttpError` (như `PERIOD_LOCKED` 409 của cổng kỳ) trả nguyên như vậy; lỗi khác trả `null` để nơi gọi bọc
 * như cũ.
 */
export function dayConflictHttp(err: unknown, status: 400 | 409): HttpError | null {
  if (err instanceof HttpError) return err;
  if (!(err instanceof DayConflictError)) return null;
  const details = { code: 'DAY_CONFLICT', ...err.info };
  return status === 400 ? new BadRequestError(err.message, details) : new ConflictError(err.message, details);
}
