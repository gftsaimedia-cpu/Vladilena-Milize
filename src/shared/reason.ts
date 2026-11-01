import config = require('../platform/config');
import warnings = require('../platform/warnings');

// Lý do ghi nhận (đặt lại mật khẩu, gán vai trò, gán ca): không bắt buộc, quá config.REASON_MAX ký tự là 400. Trả '' khi trống.
export const reasonText = `Lý do tối đa ${config.REASON_MAX} ký tự`;
export const reasonOf = (value: unknown): string => warnings.optionalReason(value, { tooLong: reasonText });
